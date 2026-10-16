import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../supabaseClient';
import { useRole } from './RoleContext';
import { DashboardGreetingHeader } from './DashboardGreetingHeader';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { 
  DollarSign, 
  PackageCheck, 
  Clock, 
  AlertCircle, 
  Calendar as CalendarIcon, 
  CheckSquare, 
  FileText, 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  X, 
  Eye, 
  ShieldCheck, 
  User, 
  Phone, 
  Tag, 
  MapPin, 
  LayoutDashboard, 
  ArrowUpRight,
  RefreshCw,
  Sparkles,
  FileSpreadsheet,
  Printer,
  Ban,
  BarChart3,
  ExternalLink,
  Image as ImageIcon,
  TrendingUp,
  Briefcase,
  Video,
  History
} from 'lucide-react';
import { CameraLensStatsCard, CameraLensTheme } from './CameraLensStatsCard';
import { calculateAllPendingRecords } from '../utils/paymentCalculations';
import { OwnerStaffPerformanceReport } from './OwnerModule';
import { BusinessOwnerCardDetailModal } from './BusinessOwnerCardDetailModal';
import { PaymentHistoryModal } from './PaymentHistoryModal';
import { AddNoteModal } from './AddNoteModal';
import { OrderHistoryModal } from './OrderHistoryModal';
import { formatINR, formatTime12Hour, formatDateDDMMYY, formatDateToDDMMYYYY, deserializeLeadEvents, resolveStorageUrl } from '../utils';
import { performBusinessOwnerReview } from '../utils/businessOwnerReview';
import { Order, Lead, Production, Payment } from '../types';
import { AssignedStaffDropdown } from './AssignedStaffDropdown';
import { OwnerPasswordResetModule } from './OwnerPasswordResetModule';
import { compareRecordsByDate, compareAlphanumeric } from './ui/ListSortFilter';
import { getAllMatchingOrderIds } from './SalesUtils';
import { DateFilterInput } from './ui/DateFilterInput';

export function getOrderRemainingPendingAmount(
  order: any, 
  ordersList: any[] = [], 
  leadsList: any[] = [], 
  paymentsList: any[] = [], 
  paymentHistoryList: any[] = []
): { finalQuotation: number; totalPaid: number; remaining: number; payStatus: string } {
  if (!order) return { finalQuotation: 0, totalPaid: 0, remaining: 0, payStatus: 'Pending' };

  const orderId = order.order_id || order.orderId || '';
  const leadId = order.lead_id || order.leadId || (order.lead && order.lead.lead_id) || '';
  const matchingOrderIds = getAllMatchingOrderIds(orderId, leadId, ordersList, leadsList);

  const orderObj = ordersList.find(o => (orderId && o.order_id === orderId) || (leadId && o.lead_id === leadId)) || order;
  const paymentObj = paymentsList.find(p => (orderId && p.order_id === orderId) || (leadId && p.lead_id === leadId) || (orderObj && p.order_id === orderObj.order_id));
  const leadObj = leadsList.find(l => (leadId && l.lead_id === leadId) || (orderObj && l.lead_id === orderObj.lead_id));

  const finalQuotation = Number(leadObj?.Final_Quotation_Amount) || 
    Number((leadObj as any)?.final_quotation_amount) || 
    Number(orderObj?.quotation_amount) || 
    Number(order?.quotation_amount) || 
    Number(order?.totalRevenue) || 
    Number(order?.finalPackageAmount) || 
    Number(leadObj?.final_amount) || 
    Number(leadObj?.budget) || 0;

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

  const orderHistories = (paymentHistoryList || []).filter((h: any) => {
    const hid = String(h.order_id || '').trim();
    return matchingOrderIds.includes(hid);
  });

  const approvedItems = orderHistories.filter((h: any) => {
    const histId = String(h.id || h.payment_history_id || '');
    if (rejectedIds.has(histId) || h.approval_status === 'Rejected') return false;
    const isExplicitlyRejected = typeof h.notes === 'string' && (
      h.notes.endsWith('- Rejected') || 
      h.notes.toLowerCase().includes('rejected by business owner')
    );
    if (isExplicitlyRejected) return false;

    return (
      h.approval_status === 'Approved' ||
      approvedIds.has(histId) ||
      (typeof h.notes === 'string' && h.notes.includes('Approved') && !h.notes.includes('Waiting for Approval')) ||
      (!h.notes && h.approval_status !== 'Waiting for Approval')
    );
  });

  const pendingItems = orderHistories.filter((h: any) => {
    const histId = String(h.id || h.payment_history_id || '');
    if (rejectedIds.has(histId) || h.approval_status === 'Rejected') return false;
    if (approvedItems.includes(h)) return false;
    return h.approval_status === 'Waiting for Approval' || (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval'));
  });

  let totalPaid = approvedItems.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
  if (orderHistories.length === 0 && paymentObj && paymentObj.payment_status !== 'Waiting for Approval') {
    totalPaid = (Number(paymentObj.advance_received) || 0) + (Number(paymentObj.final_payment_received) || 0) + (Number(paymentObj.additional_received) || 0);
  } else if (orderHistories.length === 0 && !paymentObj) {
    totalPaid = Number(orderObj?.advance_received || order?.advance_received) || 0;
  }

  const remaining = Math.max(0, finalQuotation - totalPaid);

  let payStatus = 'Pending';
  if (pendingItems.length > 0 || paymentObj?.payment_status === 'Waiting for Approval') {
    payStatus = 'Waiting for Approval';
  } else if (remaining <= 0 && finalQuotation > 0) {
    payStatus = 'Fully Paid';
  } else if (totalPaid > 0) {
    payStatus = 'Partially Paid';
  }

  return {
    finalQuotation,
    totalPaid,
    remaining,
    payStatus
  };
}

export function getOrderCreationOrUpdateTimestamp(r: any): number {
  if (!r) return 0;
  const timestamps: number[] = [];

  const addTime = (val: any) => {
    if (!val) return;
    if (typeof val === 'number' && !isNaN(val) && val > 0) {
      timestamps.push(val);
      return;
    }
    if (typeof val === 'string' && val.trim()) {
      const t = new Date(val.trim()).getTime();
      if (!isNaN(t) && t > 0) timestamps.push(t);
    }
  };

  addTime(r.updated_at);
  addTime(r.updatedAt);
  addTime(r.created_at);
  addTime(r.createdAt);
  addTime(r.paymentDate);
  
  if (r.order) {
    addTime(r.order.updated_at);
    addTime(r.order.created_at);
  }
  if (r.lead) {
    addTime(r.lead.updated_at);
    addTime(r.lead.created_at);
  }
  if (r.payment) {
    addTime(r.payment.updated_at);
    addTime(r.payment.created_at);
    addTime(r.payment.payment_date);
  }

  const numericIdMatch = String(r.orderId || r.order_id || r.leadId || '').match(/\d+/g);
  let idNumber = 0;
  if (numericIdMatch && numericIdMatch.length > 0) {
    idNumber = parseInt(numericIdMatch[numericIdMatch.length - 1], 10) || 0;
  }

  if (timestamps.length > 0) {
    return Math.max(...timestamps);
  }

  return idNumber;
}

interface BusinessOwnerDashboardProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

export const BusinessOwnerDashboard: React.FC<BusinessOwnerDashboardProps> = ({
  activeSection: initialSection = 'overview',
  onSectionChange
}) => {
  const { 
    orders, 
    leads, 
    operations,
    payments, 
    production, 
    editorAssignments,
    notifications,
    paymentHistory,
    currentUserName, 
    currentRole,
    currentUser,
    staff = [],
    users = [],
    updateOrderStage, 
    updateProduction, 
    logActivity,
    refreshData,
    globalDateRange,
    setGlobalDateRange
  } = useRole();

  // Logged-in Business Owner mobile computation
  const loggedInBusinessOwnerMobile = useMemo(() => {
    if (currentUser?.mobile) return currentUser.mobile;
    if ((currentUser as any)?.phone) return (currentUser as any).phone;

    // Look up in users list
    const userMatch = (users || []).find((u: any) =>
      (u.mobile && currentUser?.mobile && u.mobile === currentUser.mobile) ||
      (u.email && currentUser?.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (u.name && currentUser?.name && u.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      (u.role === 'Business Owner' && (u.mobile || (u as any).phone))
    );
    if (userMatch?.mobile) return userMatch.mobile;
    if ((userMatch as any)?.phone) return (userMatch as any).phone;

    // Look up in staff list
    const staffMatch = (staff || []).find((s: any) =>
      (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) ||
      (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
    if (staffMatch?.mobile) return staffMatch.mobile;
    if ((staffMatch as any)?.phone) return (staffMatch as any).phone;

    // Match by currentUserName
    if (currentUserName) {
      const matchByName = (users || []).find((u: any) =>
        (u.name && u.name.trim().toLowerCase() === currentUserName.trim().toLowerCase()) ||
        (u.full_name && u.full_name.trim().toLowerCase() === currentUserName.trim().toLowerCase())
      );
      if (matchByName?.mobile) return matchByName.mobile;
      if ((matchByName as any)?.phone) return (matchByName as any).phone;
    }

    return '';
  }, [currentUser, users, staff, currentUserName]);

  const businessOwnerName = useMemo(() => {
    if (currentUser?.name) return currentUser.name;
    if ((currentUser as any)?.full_name) return (currentUser as any).full_name;
    if (currentUserName && currentUserName !== 'Business Owner') return currentUserName;
    return '';
  }, [currentUser, currentUserName]);

  // Internal section tab state if not controlled externally
  const [internalSection, setInternalSection] = useState<'overview' | 'calendar' | 'approval' | 'summary' | 'leads_report' | 'staff_performance' | 'password_reset'>('overview');
  
  // Normalize current section ID
  const currentSection = useMemo(() => {
    if (initialSection === 'owner_overview' || initialSection === 'overview') return 'overview';
    if (initialSection === 'owner_calendar' || initialSection === 'calendar') return 'calendar';
    if (initialSection === 'owner_approval' || initialSection === 'approval') return 'approval';
    if (initialSection === 'owner_summary' || initialSection === 'summary') return 'summary';
    if (initialSection === 'owner_leads_report' || initialSection === 'leads_report') return 'leads_report';
    if (initialSection === 'owner_staff_performance' || initialSection === 'staff_performance') return 'staff_performance';
    if (initialSection === 'password_reset' || initialSection === 'owner_password_reset') return 'password_reset';
    return internalSection;
  }, [initialSection, internalSection]);

  const handleSectionSwitch = (sec: 'overview' | 'calendar' | 'approval' | 'summary' | 'leads_report' | 'staff_performance' | 'password_reset') => {
    setInternalSection(sec);
    if (onSectionChange) {
      const mapKey = sec === 'overview' ? 'owner_overview' : sec === 'calendar' ? 'owner_calendar' : sec === 'approval' ? 'owner_approval' : sec === 'summary' ? 'owner_summary' : sec === 'leads_report' ? 'owner_leads_report' : sec === 'staff_performance' ? 'owner_staff_performance' : 'password_reset';
      onSectionChange(mapKey);
    }
  };

  // Date Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'custom'>('this_month');

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return formatYMD(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return formatYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  });

  // Apply date preset
  const handlePresetChange = (preset: 'all' | 'today' | 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'custom') => {
    setDatePreset(preset);
    const today = new Date();
    const todayStr = formatYMD(today);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = formatYMD(new Date(today.getFullYear(), today.getMonth(), 1));
      const lastDay = formatYMD(new Date(today.getFullYear(), today.getMonth() + 1, 0));
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'last_month') {
      const firstDay = formatYMD(new Date(today.getFullYear(), today.getMonth() - 1, 1));
      const lastDay = formatYMD(new Date(today.getFullYear(), today.getMonth(), 0));
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'last_3_months') {
      const firstDay = formatYMD(new Date(today.getFullYear(), today.getMonth() - 3, 1));
      const lastDay = formatYMD(new Date(today.getFullYear(), today.getMonth(), 0));
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'this_year') {
      const firstDayOfYear = formatYMD(new Date(today.getFullYear(), 0, 1));
      setStartDate(firstDayOfYear);
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate(todayStr);
    }
  };

  // Filter orders based on active date range
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const dateToCheck = order.created_at ? order.created_at.split('T')[0] : order.event_date;
      if (datePreset === 'all') return true;
      if (!startDate || !endDate) return true;
      return dateToCheck >= startDate && dateToCheck <= endDate;
    });
  }, [orders, startDate, endDate, datePreset]);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const dateToCheck = lead.created_date || lead.created_at?.split('T')[0] || '';
      if (datePreset === 'all') return true;
      if (!startDate || !endDate) return true;
      return dateToCheck >= startDate && dateToCheck <= endDate;
    });
  }, [leads, startDate, endDate, datePreset]);

  const filteredOperations = useMemo(() => {
    return operations.filter(op => {
      const dateToCheck = op.created_at ? op.created_at.split('T')[0] : '';
      if (datePreset === 'all') return true;
      if (!startDate || !endDate) return true;
      return dateToCheck >= startDate && dateToCheck <= endDate;
    });
  }, [operations, startDate, endDate, datePreset]);

  const filteredProduction = useMemo(() => {
    return production.filter(prod => {
      const dateToCheck = prod.created_at ? prod.created_at.split('T')[0] : '';
      if (datePreset === 'all') return true;
      if (!startDate || !endDate) return true;
      return dateToCheck >= startDate && dateToCheck <= endDate;
    });
  }, [production, startDate, endDate, datePreset]);

  const [unlockRequests, setUnlockRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!supabaseClient) return;

    const fetchUnlockRequests = async () => {
      const { data, error } = await supabaseClient
        .from('unlock_requests')
        .select('*')
        .eq('request_status', 'Pending');
        
      if (!error && data) {
        const normalized = data.map((r: any) => ({
          ...r,
          status: r.request_status || r.status || 'Pending',
          reason: r.request_reason || r.reason || '',
          sales_staff_name: r.requested_by_name || r.sales_staff_name || '',
          sales_staff_id: r.requested_by_user_id || r.sales_staff_id || ''
        }));
        setUnlockRequests(normalized);
      }
    };

    fetchUnlockRequests();

    const channel = supabaseClient
      .channel('rt-unlock_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unlock_requests' }, () => {
        fetchUnlockRequests();
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  // Orders waiting for approval dataset - Unified across orders, production, and leads
  const waitingApprovalOrders = useMemo(() => {
    const validApprovalStages = [
      'client acceptance',
      'client accepted',
      'customer acceptance',
      'business owner review',
      'final approval',
      'accepted',
      'approved'
    ];

    const isApprovalStage = (st?: string) => {
      if (!st) return false;
      const lower = st.trim().toLowerCase();
      return validApprovalStages.some(s => lower === s || lower.includes('client acceptance'));
    };

    const isClosedStage = (st?: string) => {
      if (!st) return false;
      const lower = st.trim().toLowerCase();
      return lower === 'order closed' || lower === 'closed' || lower === 'project closed' || lower === 'completed' || lower === 'project completed';
    };

    const candidatesMap = new Map<string, Order>();

    const addOrMergeCandidate = (
      baseOrder: Order,
      relatedProd?: Production,
      relatedLead?: Lead,
      relatedPay?: Payment
    ) => {
      const key = baseOrder.order_id || baseOrder.lead_id;
      if (!key) return;

      const currentStage = baseOrder.current_stage || relatedProd?.editing_status || relatedProd?.production_status || 'Client Acceptance';

      if (isClosedStage(currentStage) || isClosedStage(relatedProd?.editing_status) || isClosedStage(baseOrder.order_status)) {
        return;
      }

      const orderMatch = isApprovalStage(baseOrder.current_stage) || isApprovalStage(baseOrder.order_status);
      const prodMatch = relatedProd && (
        isApprovalStage(relatedProd.editing_status) ||
        isApprovalStage(relatedProd.production_status) ||
        isApprovalStage(relatedProd.customer_review_status)
      );

      if (orderMatch || prodMatch) {
        const totalQuotation = baseOrder.quotation_amount || (relatedLead as any)?.quotation_amount || (relatedLead as any)?.total_quotation_amount || 0;
        const advanceRec = baseOrder.advance_received || relatedPay?.advance_received || (relatedLead as any)?.advance_received || 0;
        const finalRec = relatedPay?.final_payment_received || 0;
        const totalRec = advanceRec + finalRec;
        const balDue = relatedPay ? relatedPay.balance_due : (baseOrder.balance_amount || Math.max(0, totalQuotation - totalRec));

        const pAny = relatedProd as any;
        const lAny = relatedLead as any;
        const payAny = relatedPay as any;
        const bAny = baseOrder as any;

        const fullOrder: Order = {
          ...baseOrder,
          order_id: baseOrder.order_id || pAny?.order_id || pAny?.tracking_id || key,
          lead_id: baseOrder.lead_id || pAny?.lead_id || lAny?.lead_id || key,
          customer_name: baseOrder.customer_name || lAny?.customer_name || pAny?.customer_name || 'Client',
          mobile: bAny?.customer_phone || bAny?.mobile || lAny?.phone || lAny?.mobile || payAny?.customer_phone || '',
          custom_event_name: baseOrder.custom_event_name || baseOrder.event_type || lAny?.event_name || lAny?.event_type || 'Event',
          event_type: baseOrder.event_type || lAny?.event_type || 'Photography & Videography',
          event_date: baseOrder.event_date || pAny?.event_date || lAny?.event_date || '',
          current_stage: isApprovalStage(relatedProd?.editing_status) ? 'Client Acceptance' : (baseOrder.current_stage || 'Client Acceptance'),
          quotation_amount: totalQuotation,
          advance_received: advanceRec,
          balance_amount: balDue,
          created_at: baseOrder.created_at || pAny?.created_at || lAny?.created_at || new Date().toISOString()
        };

        candidatesMap.set(key, fullOrder);
      }
    };

    // 1. Evaluate existing orders
    (orders || []).forEach(order => {
      const prod = (production || []).find(p => 
        p.tracking_id === order.lead_id || 
        (p as any).order_id === order.lead_id || 
        p.tracking_id === order.order_id ||
        (p as any).order_id === order.order_id ||
        p.production_id === order.order_id ||
        (p as any).lead_id === order.lead_id ||
        p.production_id === `PRD-${order.lead_id}` ||
        p.production_id === `PRD-${order.order_id}`
      );
      const lead = (leads || []).find(l => l.lead_id === order.lead_id || l.lead_id === order.order_id);
      const pay = (payments || []).find(p => p.order_id === order.order_id || p.lead_id === order.lead_id);
      addOrMergeCandidate(order, prod, lead, pay);
    });

    // 2. Evaluate production records that might not be in orders array
    (production || []).forEach(prod => {
      const pAny = prod as any;
      if (isApprovalStage(prod.editing_status) || isApprovalStage(prod.production_status) || isApprovalStage(prod.customer_review_status)) {
        if (isClosedStage(prod.editing_status) || isClosedStage(prod.production_status)) return;

        const existingKey = Array.from(candidatesMap.keys()).find(k => 
          k === pAny.order_id || k === prod.tracking_id || k === pAny.lead_id || k === prod.production_id
        );

        if (!existingKey) {
          const matchingOrder = (orders || []).find(o => 
            o.order_id === pAny.order_id || o.order_id === prod.tracking_id || o.lead_id === pAny.lead_id || o.lead_id === prod.tracking_id
          );
          const lead = (leads || []).find(l => l.lead_id === pAny.lead_id || l.lead_id === prod.tracking_id || l.lead_id === pAny.order_id);
          const pay = (payments || []).find(p => p.order_id === pAny.order_id || p.tracking_id === prod.tracking_id || p.lead_id === pAny.lead_id);
          const lAny = lead as any;

          const baseOrder: Order = matchingOrder || {
            order_id: pAny.order_id || prod.tracking_id || prod.production_id,
            lead_id: pAny.lead_id || prod.tracking_id || pAny.order_id,
            customer_name: pAny.customer_name || lAny?.customer_name || 'Client',
            customer_phone: pAny.customer_mobile || lAny?.phone || lAny?.mobile || '',
            custom_event_name: lAny?.event_name || lAny?.event_type || 'Photography & Videography',
            event_type: lAny?.event_type || 'Photography & Videography',
            event_date: pAny.event_date || lAny?.event_date || '',
            current_stage: 'Client Acceptance',
            order_status: 'Client Acceptance',
            quotation_amount: lAny?.quotation_amount || 0,
            advance_received: lAny?.advance_received || 0,
            balance_amount: lAny?.balance_amount || 0,
            created_at: pAny.created_at || lAny?.created_at || new Date().toISOString()
          };

          addOrMergeCandidate(baseOrder, prod, lead, pay);
        }
      }
    });

    return Array.from(candidatesMap.values()).sort((a, b) => compareRecordsByDate(a, b, 'latest'));
  }, [orders, production, leads, payments]);

  // KPI Metrics Calculation for Overview
  const totalRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.quotation_amount || o.advance_received || 0), 0);
  }, [filteredOrders]);

  const activeOrdersCount = useMemo(() => {
    return filteredOrders.filter(o => o.current_stage !== 'Order Closed' && o.current_stage !== 'Closed' && o.current_stage !== 'Event Cancelled').length;
  }, [filteredOrders]);

  // Unified Lifecycle Pipeline across Sales, Operations, Production, Acceptance & Closed
  const unifiedPipeline = useMemo(() => {
    const safeLeads = Array.isArray(leads) ? leads : [];
    const safeOrders = Array.isArray(orders) ? orders : [];
    const safeOps = Array.isArray(operations) ? operations : [];
    const safeProd = Array.isArray(production) ? production : [];

    const itemMap = new Map<string, any>();

    const getOrCreate = (key: string) => {
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          id: key,
          lead_id: key,
          order_id: '',
          customer_name: 'Client',
          mobile: '',
          custom_event_name: 'Event',
          event_type: '',
          event_date: '',
          delivery_date: '',
          quotation_amount: 0,
          sales_person: 'Unassigned',
          sales_status: 'New Lead',
          ops_status: 'Not Started',
          prod_status: 'Not Started',
          acceptance_status: 'Pending',
          closed_status: 'Active',
          current_status: 'New Lead',
          assigned_crew: 'Unassigned',
          editor: 'Unassigned',
          hasEnteredSales: true,
          hasEnteredOps: false,
          hasEnteredProd: false,
          hasEnteredAcceptance: false,
          isClosed: false,
          created_at: '',
          rawLead: undefined,
          rawOrder: undefined,
          rawOps: undefined,
          rawProd: undefined
        });
      }
      return itemMap.get(key);
    };

    // 1. Process Leads
    safeLeads.forEach(lead => {
      if (!lead || !lead.lead_id) return;
      const item = getOrCreate(lead.lead_id);
      item.lead_id = lead.lead_id;
      item.customer_name = lead.customer_name || item.customer_name;
      item.mobile = lead.mobile || lead.phone || item.mobile;
      item.custom_event_name = lead.custom_event_name || lead.event_name || lead.event_type || item.custom_event_name;
      item.event_type = lead.event_type || item.event_type;
      item.event_date = lead.event_date || item.event_date;
      item.quotation_amount = lead.quotation_amount || lead.grand_total || lead.final_quotation_amount || lead.package_price || lead.budget || item.quotation_amount;
      item.sales_person = lead.sales_person || lead.sales_staff_name || lead.created_by || item.sales_person;
      item.sales_status = lead.current_status || lead.status || 'Active Lead';
      item.current_status = item.sales_status;
      item.created_at = lead.created_date || lead.created_at || item.created_at;
      item.rawLead = lead;
    });

    // 2. Process Orders
    safeOrders.forEach(order => {
      if (!order) return;
      const key = order.lead_id || order.order_id;
      if (!key) return;
      const item = getOrCreate(key);

      if (order.lead_id) item.lead_id = order.lead_id;
      if (order.order_id) item.order_id = order.order_id;

      item.customer_name = order.customer_name || item.customer_name;
      item.mobile = (order as any).customer_phone || (order as any).mobile || item.mobile;
      item.custom_event_name = order.custom_event_name || order.event_type || item.custom_event_name;
      item.event_type = order.event_type || item.event_type;
      item.event_date = order.event_date || item.event_date;
      item.quotation_amount = order.quotation_amount || order.grand_total || item.quotation_amount;
      item.created_at = order.created_at || item.created_at;
      item.rawOrder = order;

      item.hasEnteredSales = true;
      item.hasEnteredOps = true;

      const oStage = (order.current_stage || order.order_status || '').trim();
      const oLower = oStage.toLowerCase();

      if (oLower.includes('confirm')) {
        item.sales_status = 'Order Confirmed';
      }

      if (oLower.includes('closed') || oLower.includes('completed')) {
        item.hasEnteredProd = true;
        item.hasEnteredAcceptance = true;
        item.isClosed = true;
        item.closed_status = 'Order Closed';
        item.ops_status = 'Operations Completed';
        item.prod_status = 'Production Completed';
        item.acceptance_status = 'Client Accepted';
        item.current_status = 'Order Closed';
      } else if (oLower.includes('acceptance') || oLower.includes('approved') || oLower.includes('customer review')) {
        item.hasEnteredProd = true;
        item.hasEnteredAcceptance = true;
        item.ops_status = 'Operations Completed';
        item.prod_status = 'Proof Uploaded';
        item.acceptance_status = 'Acceptance Pending';
        item.current_status = 'Acceptance Pending';
      } else if (oLower.includes('production') || oLower.includes('editing') || oLower.includes('proof')) {
        item.hasEnteredProd = true;
        item.ops_status = 'Operations Completed';
        item.prod_status = oStage || 'In Production';
        item.current_status = oStage || 'Production Started';
      } else if (oLower.includes('operation')) {
        item.ops_status = oStage || 'Operations Assigned';
        item.current_status = oStage || 'Operations Assigned';
      } else if (oStage) {
        item.current_status = oStage;
      }
    });

    // 3. Process Operations
    safeOps.forEach(op => {
      if (!op) return;
      const opOrderId = op.order_id || (op as any).tracking_id;
      if (!opOrderId) return;

      let item = Array.from(itemMap.values()).find(i => i.order_id === opOrderId || i.lead_id === opOrderId || i.id === opOrderId);
      if (!item) {
        item = getOrCreate(opOrderId);
        item.order_id = opOrderId;
      }

      item.rawOps = op;
      item.hasEnteredOps = true;

      if (op.event_date) item.event_date = op.event_date;
      if ((op as any).customer_name) item.customer_name = (op as any).customer_name;

      const crewList = [op.photographer_assigned, op.videographer_assigned, op.drone_operator_assigned, op.assistant_assigned].filter(Boolean);
      const assignedCrew = crewList.length > 0 ? crewList.join(', ') : ((op as any).assigned_photographer || (op as any).assigned_crew || (op as any).assigned_staff || item.assigned_crew);
      item.assigned_crew = assignedCrew;

      const rawOpStatus = op.event_status || (op as any).operations_status || (op as any).status || 'Assigned';
      item.ops_status = rawOpStatus;

      const opLower = rawOpStatus.toLowerCase();
      if (opLower.includes('complete') || opLower.includes('delivered') || opLower.includes('closed') || opLower.includes('handover')) {
        item.ops_status = 'Operations Completed';
        item.hasEnteredProd = true;
        if (item.current_status === 'New Lead' || item.current_status === 'Order Confirmed' || item.current_status.toLowerCase().includes('operation')) {
          item.current_status = 'Production Started';
        }
      } else {
        if (!item.hasEnteredProd && !item.isClosed && !item.hasEnteredAcceptance) {
          item.current_status = `Operations: ${rawOpStatus}`;
        }
      }
    });

    // 4. Process Production
    safeProd.forEach(prod => {
      if (!prod) return;
      const pOrderId = prod.order_id || prod.tracking_id || (prod as any).production_id;
      if (!pOrderId) return;

      let item = Array.from(itemMap.values()).find(i => i.order_id === pOrderId || i.lead_id === pOrderId || i.id === pOrderId);
      if (!item) {
        item = getOrCreate(pOrderId);
        item.order_id = pOrderId;
      }

      item.rawProd = prod;
      item.hasEnteredOps = true;
      item.hasEnteredProd = true;

      if (prod.expected_delivery_date || (prod as any).delivery_date || prod.target_delivery_date) {
        item.delivery_date = prod.expected_delivery_date || (prod as any).delivery_date || prod.target_delivery_date;
      }
      if (prod.editor_assigned || (prod as any).assigned_editor || (prod as any).assigned_staff) {
        item.editor = prod.editor_assigned || (prod as any).assigned_editor || (prod as any).assigned_staff;
      }
      if (prod.proof_url || (prod as any).proof_link) {
        item.proof_url = prod.proof_url || (prod as any).proof_link;
      }
      if (prod.footage_url) {
        item.footage_url = prod.footage_url;
      }

      const rawProdStatus = prod.editing_status || prod.production_status || (prod as any).status || 'Editing Started';
      item.prod_status = rawProdStatus;

      const prLower = rawProdStatus.toLowerCase();
      if (prLower.includes('client acceptance') || prLower.includes('customer review') || prLower.includes('proof uploaded')) {
        item.hasEnteredAcceptance = true;
        item.acceptance_status = 'Acceptance Pending';
        if (!item.isClosed) {
          item.current_status = 'Proof Uploaded (Acceptance Pending)';
        }
      } else if (prLower.includes('closed') || (prLower.includes('complete') && prLower.includes('project'))) {
        item.hasEnteredAcceptance = true;
        item.isClosed = true;
        item.closed_status = 'Order Closed';
        item.current_status = 'Order Closed';
      } else {
        if (!item.isClosed && !item.hasEnteredAcceptance) {
          item.current_status = rawProdStatus;
        }
      }
    });

    // Date range filtering helper
    const isWithinDate = (dateStr?: string) => {
      if (datePreset === 'all' || (!startDate && !endDate)) return true;
      if (!dateStr) return true;
      const cleanDate = dateStr.split('T')[0];
      if (startDate && cleanDate < startDate) return false;
      if (endDate && cleanDate > endDate) return false;
      return true;
    };

    return Array.from(itemMap.values()).filter(item => {
      const d = item.created_at || item.event_date || '';
      return isWithinDate(d);
    });
  }, [leads, orders, operations, production, startDate, endDate, datePreset]);

  // Dedicated Production Projects Pipeline with Strict Event-Level Isolation and Zero Operations Data
  const productionProjects = useMemo(() => {
    const safeProd = Array.isArray(production) ? production : [];
    const safeOrders = Array.isArray(orders) ? orders : [];
    const safeLeads = Array.isArray(leads) ? leads : [];
    const safeAssignments = Array.isArray(editorAssignments) ? editorAssignments : [];

    // Pre-production stages that belong strictly to Sales or Operations
    const preProductionStages = [
      'new lead', 'follow up', 'follow-up', 'quotation sent', 'booking requested',
      'order confirmed', 'confirm order', 'new order', 'order created',
      'operations assigned', 'assigned crew', 'staff assigned', 'crew assigned',
      'event scheduled', 'event started', 'event completed', 'event ended',
      'footage handover', 'raw footage handover'
    ];

    // Build quick lookup maps for orders and leads
    const orderMap = new Map<string, Order>();
    safeOrders.forEach(o => {
      if (o.order_id) orderMap.set(o.order_id, o);
      if (o.lead_id) orderMap.set(o.lead_id, o);
    });

    const leadMap = new Map<string, Lead>();
    safeLeads.forEach(l => {
      if (l.lead_id) leadMap.set(l.lead_id, l);
    });

    // Helper to extract events for an order/lead
    const getEventsForOrderLead = (ord?: Order, ld?: Lead): any[] => {
      const rawLeadEvents = ld?.events && Array.isArray(ld.events) && ld.events.length > 0
        ? ld.events
        : (ord?.events && Array.isArray(ord.events) && ord.events.length > 0 ? ord.events : []);
      const deserialized = (!rawLeadEvents || rawLeadEvents.length === 0) && (ld?.notes_special_customizations || ord?.notes_special_customizations)
        ? deserializeLeadEvents(ld?.notes_special_customizations || ord?.notes_special_customizations).events
        : [];
      return rawLeadEvents.length > 0 ? rawLeadEvents : (deserialized.length > 0 ? deserialized : []);
    };

    const projectItems: any[] = [];
    const processedEventKeys = new Set<string>();

    // 1. Group production records by order/lead
    const prodByTracking = new Map<string, Production[]>();
    safeProd.forEach(p => {
      if (!p || !p.production_id) return;
      const tId = p.order_id || p.tracking_id || p.production_id;
      if (!prodByTracking.has(tId)) {
        prodByTracking.set(tId, []);
      }
      prodByTracking.get(tId)!.push(p);
    });

    // 2. Group assignments by order
    const assignmentsByOrder = new Map<string, typeof safeAssignments>();
    safeAssignments.forEach(a => {
      if (!a) return;
      const key = a.order_id || a.production_id;
      if (!key) return;
      if (!assignmentsByOrder.has(key)) {
        assignmentsByOrder.set(key, []);
      }
      assignmentsByOrder.get(key)!.push(a);
    });

    // Gather all candidate keys that have production presence
    const allCandidateKeys = new Set<string>([
      ...prodByTracking.keys(),
      ...assignmentsByOrder.keys()
    ]);

    // Also include orders marked in production / completed stages
    safeOrders.forEach(o => {
      const st = (o.current_stage || '').toLowerCase().trim();
      if (
        st.includes('production') ||
        st.includes('editing') ||
        st.includes('proof') ||
        st.includes('client acceptance') ||
        st.includes('approval') ||
        st.includes('completed') ||
        st.includes('closed')
      ) {
        if (o.order_id) allCandidateKeys.add(o.order_id);
        if (o.lead_id) allCandidateKeys.add(o.lead_id);
      }
    });

    allCandidateKeys.forEach(candidateKey => {
      const linkedOrder = orderMap.get(candidateKey) || safeOrders.find(o => o.order_id === candidateKey || o.lead_id === candidateKey);
      const linkedLead = leadMap.get(candidateKey) || (linkedOrder?.lead_id ? leadMap.get(linkedOrder.lead_id) : undefined);

      const prodsForThis = prodByTracking.get(candidateKey) || 
        (linkedOrder?.order_id ? prodByTracking.get(linkedOrder.order_id) : undefined) ||
        (linkedOrder?.lead_id ? prodByTracking.get(linkedOrder.lead_id) : undefined) ||
        [];

      const assignmentsForThis = assignmentsByOrder.get(candidateKey) ||
        (linkedOrder?.order_id ? assignmentsByOrder.get(linkedOrder.order_id) : undefined) ||
        (linkedOrder?.lead_id ? assignmentsByOrder.get(linkedOrder.lead_id) : undefined) ||
        [];

      const hasProdRecord = prodsForThis.length > 0;
      const hasAssignments = assignmentsForThis.length > 0;
      const orderStage = (linkedOrder?.current_stage || '').toLowerCase().trim();
      const isProdOrderStage = orderStage.includes('production') || orderStage.includes('editing') || orderStage.includes('proof') || orderStage.includes('acceptance') || orderStage.includes('closed') || orderStage.includes('completed');

      if (!hasProdRecord && !hasAssignments && !isProdOrderStage) {
        return;
      }

      // If strictly in operations or sales without production handover, skip
      if (preProductionStages.includes(orderStage) && !hasProdRecord && !hasAssignments) {
        return;
      }

      // Resolve events for this candidate
      const events = getEventsForOrderLead(linkedOrder, linkedLead);

      if (events.length > 1) {
        // STRICT EVENT-LEVEL ISOLATION FOR MULTIPLE EVENTS
        events.forEach((ev: any, idx: number) => {
          const eventId = ev.id || ev.event_id || `EVT-${idx + 1}`;
          const eventName = ev.event_name || ev.event_type || `Event ${idx + 1}`;
          const uniqueEventKey = `${linkedOrder?.order_id || candidateKey}_${eventId}`;

          if (processedEventKeys.has(uniqueEventKey)) return;
          processedEventKeys.add(uniqueEventKey);

          // Find production record specific to this event
          const eventProd = prodsForThis.find(p => 
            (p.event_id && (p.event_id === eventId || p.event_id === ev.id || p.event_id === ev.event_id)) ||
            (p.custom_event_name && (p.custom_event_name === eventName || p.custom_event_name === ev.event_name || p.custom_event_name === ev.event_type))
          ) || (prodsForThis.length === 1 && (!prodsForThis[0].event_id || prodsForThis[0].event_id === 'MULTIPLE') ? prodsForThis[0] : undefined);

          // Find assignments strictly for this event
          const eventAssignments = assignmentsForThis.filter(a => 
            (a.event_id && (a.event_id === eventId || a.event_id === ev.id || a.event_id === ev.event_id || a.event_id === eventName))
          );

          // Target delivery date strictly for this event
          let targetDate = ev.target_delivery_date || '';
          if (!targetDate && eventProd?.target_delivery_date) targetDate = eventProd.target_delivery_date;
          if (!targetDate && eventProd?.expected_delivery_date) targetDate = eventProd.expected_delivery_date;
          if (!targetDate && eventAssignments.length > 0) {
            const aDate = eventAssignments.find(a => a.target_finish_date && a.target_finish_date.trim() !== '')?.target_finish_date;
            if (aDate) targetDate = aDate;
          }

          // Assigned editor strictly for this event
          const editorNames = Array.from(new Set([
            eventProd?.editor_assigned,
            eventProd?.assigned_staff,
            ...eventAssignments.map(a => a.staff_name).filter(Boolean)
          ].filter(n => n && n !== 'Unassigned' && n !== 'None'))).join(', ') || 'Unassigned';

          // Status strictly for this event
          let status = eventProd?.editing_status || eventProd?.production_status || 'Pending';
          if (eventAssignments.length > 0) {
            const allDone = eventAssignments.every(a => ['Completed', 'Project Completed', 'Editing Complete', 'Editing Completed'].includes(a.status));
            const anyActive = eventAssignments.some(a => ['Editing Started', 'In Progress', 'Customer Review', 'Client Review', 'Revision'].includes(a.status));
            if (allDone) status = 'Editing Completed';
            else if (anyActive) status = 'Editing In Progress';
          }

          projectItems.push({
            id: uniqueEventKey,
            production_id: eventProd?.production_id || `PRD-${uniqueEventKey}`,
            order_id: linkedOrder?.order_id || candidateKey,
            lead_id: linkedLead?.lead_id || linkedOrder?.lead_id || candidateKey,
            customer_name: linkedOrder?.customer_name || linkedLead?.customer_name || eventProd?.customer_name || 'Client',
            customer_mobile: linkedOrder?.mobile || linkedLead?.mobile || (eventProd as any)?.customer_mobile || '',
            custom_event_name: eventName,
            event_id: eventId,
            event_date: ev.event_date || linkedOrder?.event_date || '',
            delivery_date: targetDate,
            editor: editorNames,
            assigned_editor: editorNames,
            prod_status: status,
            proof_url: eventProd?.proof_url || (eventProd as any)?.delivery_link || '',
            rawProd: eventProd,
            rawOrder: linkedOrder,
            rawLead: linkedLead,
            created_at: (eventProd as any)?.created_at || linkedOrder?.created_at || linkedLead?.created_date || ''
          });
        });
      } else {
        // SINGLE EVENT OR STANDALONE PRODUCTION RECORD
        const primaryProd = prodsForThis[0];
        const primaryEv = events[0];
        const uniqueKey = linkedOrder?.order_id || primaryProd?.production_id || candidateKey;

        if (processedEventKeys.has(uniqueKey)) return;
        processedEventKeys.add(uniqueKey);

        const eventName = primaryProd?.custom_event_name || primaryEv?.event_name || primaryEv?.event_type || linkedOrder?.custom_event_name || linkedOrder?.event_type || linkedLead?.custom_event_name || linkedLead?.event_type || 'Event Project';
        const eventDate = primaryProd?.event_date || primaryEv?.event_date || linkedOrder?.event_date || linkedLead?.event_date || '';

        let targetDate = primaryProd?.target_delivery_date || primaryProd?.expected_delivery_date || primaryProd?.delivery_date || primaryEv?.target_delivery_date || (linkedLead as any)?.delivery_target_date || '';
        if (!targetDate && assignmentsForThis.length > 0) {
          const aDate = assignmentsForThis.find(a => a.target_finish_date && a.target_finish_date.trim() !== '')?.target_finish_date;
          if (aDate) targetDate = aDate;
        }

        const editorNames = Array.from(new Set([
          primaryProd?.editor_assigned,
          primaryProd?.assigned_staff,
          ...assignmentsForThis.map(a => a.staff_name).filter(Boolean)
        ].filter(n => n && n !== 'Unassigned' && n !== 'None'))).join(', ') || 'Unassigned';

        let status = primaryProd?.editing_status || primaryProd?.production_status || (linkedOrder?.current_stage && isProdOrderStage ? linkedOrder.current_stage : 'Pending');
        if (assignmentsForThis.length > 0) {
          const allDone = assignmentsForThis.every(a => ['Completed', 'Project Completed', 'Editing Complete', 'Editing Completed'].includes(a.status));
          const anyActive = assignmentsForThis.some(a => ['Editing Started', 'In Progress', 'Customer Review', 'Client Review', 'Revision'].includes(a.status));
          if (allDone) status = 'Editing Completed';
          else if (anyActive) status = 'Editing In Progress';
        }

        projectItems.push({
          id: uniqueKey,
          production_id: primaryProd?.production_id || `PRD-${uniqueKey}`,
          order_id: linkedOrder?.order_id || candidateKey,
          lead_id: linkedLead?.lead_id || linkedOrder?.lead_id || candidateKey,
          customer_name: primaryProd?.customer_name || linkedOrder?.customer_name || linkedLead?.customer_name || 'Client',
          customer_mobile: (primaryProd as any)?.customer_mobile || linkedOrder?.mobile || linkedLead?.mobile || '',
          custom_event_name: eventName,
          event_id: primaryProd?.event_id || primaryEv?.id || 'EVT-01',
          event_date: eventDate,
          delivery_date: targetDate,
          editor: editorNames,
          assigned_editor: editorNames,
          prod_status: status,
          proof_url: primaryProd?.proof_url || (primaryProd as any)?.delivery_link || '',
          rawProd: primaryProd,
          rawOrder: linkedOrder,
          rawLead: linkedLead,
          created_at: (primaryProd as any)?.created_at || linkedOrder?.created_at || linkedLead?.created_date || ''
        });
      }
    });

    // Date range filtering helper
    const isWithinDate = (dateStr?: string) => {
      if (datePreset === 'all' || (!startDate && !endDate)) return true;
      if (!dateStr) return true;
      const cleanDate = dateStr.split('T')[0];
      if (startDate && cleanDate < startDate) return false;
      if (endDate && cleanDate > endDate) return false;
      return true;
    };

    return projectItems.filter(item => {
      const d = item.delivery_date || item.event_date || item.created_at || '';
      return isWithinDate(d);
    });
  }, [production, orders, leads, editorAssignments, startDate, endDate, datePreset]);

  const boCardsData = useMemo(() => {
    // SALES
    const salesTotalLeads = unifiedPipeline.filter(i => i.hasEnteredSales);
    const salesConverted = salesTotalLeads.filter(i => (i.sales_status || '').toLowerCase().includes('confirm') || i.order_id);
    const salesLost = salesTotalLeads.filter(i => (i.sales_status || '').toLowerCase().includes('lost'));
    const salesFollowup = salesTotalLeads.filter(i => (i.sales_status || '').toLowerCase().includes('quotation'));

    // OPERATIONS
    const opsAll = unifiedPipeline.filter(i => i.hasEnteredOps);
    const opsNew = opsAll.filter(i => (i.ops_status || '').toLowerCase().includes('pending') || (i.ops_status || '').toLowerCase().includes('assigned') || (i.ops_status || '').toLowerCase() === 'not started');
    const opsCompleted = opsAll.filter(i => (i.ops_status || '').toLowerCase().includes('complete') || (i.ops_status || '').toLowerCase().includes('delivered'));
    const opsUpcoming = opsAll.filter(i => i.event_date && new Date(i.event_date) >= new Date() && !(i.ops_status || '').toLowerCase().includes('complete'));
    const opsScheduled = opsAll.filter(i => (i.ops_status || '').toLowerCase().includes('scheduled') || i.assigned_crew !== 'Unassigned');

    // PRODUCTION - STRICTLY PRODUCTION-ONLY DATA & EVENT-LEVEL ISOLATED
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isCompletedProject = (item: any) => {
      const st = (item.production_status || item.prod_status || '').toLowerCase().trim();
      return (
        st.includes('completed') ||
        st.includes('delivered') ||
        st.includes('order closed') ||
        st === 'closed' ||
        st.includes('client acceptance') ||
        st.includes('approved') ||
        st.includes('final approval') ||
        st.includes('client accepted')
      );
    };

    const isOverdueProject = (item: any) => {
      if (isCompletedProject(item)) return false;
      const deadlineStr = item.delivery_date || (item.rawProd && (item.rawProd.target_delivery_date || item.rawProd.expected_delivery_date || item.rawProd.delivery_date));
      if (!deadlineStr || deadlineStr.trim() === '' || deadlineStr === 'Pending' || deadlineStr === 'N/A' || deadlineStr === '—') return false;
      const cleanDate = deadlineStr.split('T')[0];
      const deadline = new Date(cleanDate);
      if (isNaN(deadline.getTime())) return false;
      return deadline < today;
    };

    const isInProgressProject = (item: any) => {
      if (isCompletedProject(item)) return false;
      const editingStatus = (item.editing_status || '').toLowerCase().trim();
      const prodStatus = (item.production_status || item.prod_status || '').toLowerCase().trim();
      
      // The user specified:
      // - Editing Started
      // - Customer Review
      return (
        editingStatus === 'editing started' ||
        editingStatus === 'customer review' ||
        prodStatus === 'editing started' ||
        prodStatus === 'customer review'
      );
    };

    const isPendingProject = (item: any) => {
      if (isCompletedProject(item) || isInProgressProject(item)) return false;
      return true;
    };

    const prodTotal = productionProjects;
    const prodPending = productionProjects.filter(isPendingProject);
    const prodInProgress = productionProjects.filter(isInProgressProject);
    const prodCompleted = productionProjects.filter(isCompletedProject);
    const prodOverdue = productionProjects.filter(isOverdueProject);

    return {
      salesTotalLeads, salesConverted, salesLost, salesFollowup,
      opsNew, opsCompleted, opsUpcoming, opsScheduled, opsAll,
      // Production - 5 standardized production-only metrics
      prodTotal, prodPending, prodInProgress, prodCompleted, prodOverdue,
      // Aliases for backwards compatibility
      prodNew: prodPending,
      prodEditingCompleted: prodCompleted,
      prodClientAcceptance: prodCompleted,
      prodAll: prodTotal
    };
  }, [unifiedPipeline, productionProjects]);

  // Unified pending payment records matching Sales Dashboard Payment Pending exactly
  const allPendingRecords = useMemo(() => {
    return calculateAllPendingRecords(orders, leads, payments, paymentHistory);
  }, [orders, leads, payments, paymentHistory]);

  const outstandingPaymentTotal = useMemo(() => {
    return allPendingRecords.reduce((sum, r) => sum + (r.paymentStatus === 'Fully Paid' ? 0 : r.remainingAmount), 0);
  }, [allPendingRecords]);

  // Clickable card modal state
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenCard = (e: any) => setSelectedCard(e.detail);
    window.addEventListener('open-business-owner-card', handleOpenCard);
    return () => window.removeEventListener('open-business-owner-card', handleOpenCard);
  }, []);

  // Configs for Overview Card details
  const modalData = useMemo(() => {
    if (!selectedCard) return [];
    if (selectedCard === 'overview_revenue') return filteredOrders;
    if (selectedCard === 'overview_active') return filteredOrders.filter(o => o.current_stage !== 'Order Closed' && o.current_stage !== 'Closed' && o.current_stage !== 'Event Cancelled');
    if (selectedCard === 'overview_approval') return waitingApprovalOrders;
    if (selectedCard === 'overview_outstanding') return allPendingRecords.filter(r => r.remainingAmount > 0).map(r => ({
      ...r.order,
      order_id: r.orderId,
      customer_name: r.customerName,
      event_type: r.eventType,
      event_date: r.eventDate,
      totalRevenue: r.finalPackageAmount,
      paymentReceived: r.totalPaidAmount,
      outstandingAmount: r.remainingAmount
    }));

    // SALES CARDS
    if (selectedCard === 'sales_total_leads' || selectedCard === 'overview_sales') {
      return boCardsData.salesTotalLeads;
    }
    if (selectedCard === 'sales_total_converted') {
      return boCardsData.salesConverted;
    }
    if (selectedCard === 'sales_total_lost') {
      return boCardsData.salesLost;
    }
    if (selectedCard === 'sales_quotation_followup') {
      return boCardsData.salesFollowup;
    }

    // OPERATIONS CARDS
    if (selectedCard === 'ops_new' || selectedCard === 'ops_completed' || selectedCard === 'ops_upcoming' || selectedCard === 'ops_scheduled' || selectedCard === 'overview_ops') {
      return selectedCard === 'ops_new' ? boCardsData.opsNew
        : selectedCard === 'ops_completed' ? boCardsData.opsCompleted
        : selectedCard === 'ops_upcoming' ? boCardsData.opsUpcoming
        : selectedCard === 'ops_scheduled' ? boCardsData.opsScheduled
        : boCardsData.opsAll;
    }

    // PRODUCTION CARDS
    if (
      selectedCard === 'prod_total' ||
      selectedCard === 'prod_pending' ||
      selectedCard === 'prod_new' ||
      selectedCard === 'prod_inprogress' ||
      selectedCard === 'prod_completed' ||
      selectedCard === 'prod_editing_completed' ||
      selectedCard === 'prod_client_acceptance' ||
      selectedCard === 'prod_overdue' ||
      selectedCard === 'overview_prod' ||
      selectedCard === 'overview_acceptance'
    ) {
      return selectedCard === 'prod_total' ? boCardsData.prodTotal
        : (selectedCard === 'prod_pending' || selectedCard === 'prod_new') ? boCardsData.prodPending
        : selectedCard === 'prod_inprogress' ? boCardsData.prodInProgress
        : (selectedCard === 'prod_completed' || selectedCard === 'prod_editing_completed' || selectedCard === 'prod_client_acceptance' || selectedCard === 'overview_acceptance') ? boCardsData.prodCompleted
        : selectedCard === 'prod_overdue' ? boCardsData.prodOverdue
        : boCardsData.prodTotal;
    }

    if (selectedCard === 'overview_closed') {
      return unifiedPipeline.filter(i => i.isClosed);
    }

    return [];
  }, [selectedCard, filteredOrders, waitingApprovalOrders, payments, boCardsData, unifiedPipeline]);

  const modalColumns = useMemo(() => {
    const actionCol = { 
      key: 'actions', 
      label: 'Action', 
      render: (item: any) => (
        <button
          type="button"
          onClick={() => setSelectedHistoryOrder(item.rawOrder || item.rawLead || item)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
          title="View Project History & Timeline"
        >
          <History className="w-3.5 h-3.5" />
          <span>History</span>
        </button>
      )
    };

    const baseOrderCols = [
      { key: 'order_id', label: 'Order ID', render: (item: any) => <span className="font-mono text-zinc-400">{item.order_id || item.lead_id}</span> },
      { key: 'customer_name', label: 'Customer Name', render: (item: any) => <span className="font-bold text-white">{item.customer_name}</span> },
      { key: 'custom_event_name', label: 'Event Name', render: (item: any) => <span className="text-zinc-200">{item.custom_event_name || item.event_type || 'Photography'}</span> },
      { key: 'assigned_staff', label: 'Assigned Staff', render: (item: any) => <AssignedStaffDropdown orderId={item.order_id || item.orderId} leadId={item.lead_id || item.leadId} lead={item.rawLead} order={item.rawOrder} /> },
      { key: 'event_date', label: 'Event Date', render: (item: any) => <span className="font-mono text-zinc-400">{item.event_date ? formatDateDDMMYY(item.event_date) : 'N/A'}</span> }
    ];

    const baseLeadCols = [
      { key: 'lead_id', label: 'Lead ID', render: (item: any) => <span className="font-mono text-zinc-400 font-bold">{item.lead_id}</span> },
      { key: 'order_id', label: 'Order ID', render: (item: any) => <span className="font-mono text-zinc-300 font-bold">{item.order_id || 'N/A'}</span> },
      { key: 'customer_name', label: 'Customer Name', render: (item: any) => (
        <div>
          <span className="font-bold text-white block">{item.customer_name}</span>
          {item.mobile && item.mobile !== 'N/A' && <span className="text-[10px] text-zinc-400 font-mono">{item.mobile}</span>}
        </div>
      )},
      { key: 'custom_event_name', label: 'Event / Type', render: (item: any) => <span className="text-zinc-300">{item.custom_event_name || 'Event'}</span> },
      { key: 'event_date', label: 'Event Date', render: (item: any) => <span className="font-mono text-zinc-400 text-xs">{item.event_date ? formatDateDDMMYY(item.event_date) : 'N/A'}</span> },
      { key: 'assigned_staff', label: 'Assigned Staff', render: (item: any) => <AssignedStaffDropdown leadId={item.lead_id} orderId={item.order_id} lead={item.rawLead} order={item.rawOrder} /> },
      { key: 'quotation_amount', label: 'Quotation Amount', render: (item: any) => <span className="font-mono text-emerald-400 font-bold text-xs">{formatINR(item.quotation_amount || 0)}</span> },
      { key: 'sales_status', label: 'Sales Status', render: (item: any) => <span className="text-zinc-300 font-mono text-xs">{item.sales_status}</span> },
      { key: 'current_status', label: 'Current Status', render: (item: any) => (
        <span className={`px-2 py-0.5 rounded-lg border font-bold font-mono text-[10px] ${
          (item.current_status || '').toLowerCase().includes('closed') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          (item.current_status || '').toLowerCase().includes('lost') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
          (item.current_status || '').toLowerCase().includes('production') ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
          'bg-amber-500/10 text-amber-400 border-amber-500/20'
        }`}>
          {item.current_status || item.sales_status || 'Active'}
        </span>
      )}
    ];

    const baseOpsCols = [
      { key: 'lead_id', label: 'Lead ID', render: (item: any) => <span className="font-mono text-zinc-400 font-bold">{item.lead_id}</span> },
      { key: 'order_id', label: 'Order ID', render: (item: any) => <span className="font-mono text-zinc-300 font-bold">{item.order_id || 'N/A'}</span> },
      { key: 'customer_name', label: 'Customer Name', render: (item: any) => <span className="font-bold text-white">{item.customer_name}</span> },
      { key: 'custom_event_name', label: 'Event / Shoot Type', render: (item: any) => <span className="text-zinc-200">{item.custom_event_name}</span> },
      { key: 'event_date', label: 'Shoot Date', render: (item: any) => <span className="font-mono text-zinc-400 text-xs">{item.event_date ? formatDateDDMMYY(item.event_date) : 'N/A'}</span> },
      { key: 'assigned_staff', label: 'Assigned Staff', render: (item: any) => <AssignedStaffDropdown leadId={item.lead_id} orderId={item.order_id} lead={item.rawLead} order={item.rawOrder} /> },
      { key: 'ops_status', label: 'Ops Status', render: (item: any) => (
        <span className={`px-2 py-0.5 rounded-lg border font-bold font-mono text-[10px] ${
          (item.ops_status || '').toLowerCase().includes('complete') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          'bg-blue-500/10 text-blue-400 border-blue-500/20'
        }`}>
          {item.ops_status || 'Active'}
        </span>
      )},
      { key: 'current_status', label: 'Current Status', render: (item: any) => (
        <span className={`px-2 py-0.5 rounded-lg border font-bold font-mono text-[10px] ${
          (item.current_status || '').toLowerCase().includes('closed') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          (item.current_status || '').toLowerCase().includes('production') ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
          (item.current_status || '').toLowerCase().includes('acceptance') ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
          'bg-blue-500/10 text-blue-400 border-blue-500/20'
        }`}>
          {item.current_status || 'Active'}
        </span>
      )}
    ];

    const baseProdCols = [
      { key: 'lead_id', label: 'Lead ID', render: (item: any) => <span className="font-mono text-zinc-400 font-bold">{item.lead_id}</span> },
      { key: 'order_id', label: 'Order ID', render: (item: any) => <span className="font-mono text-zinc-300 font-bold">{item.order_id || 'N/A'}</span> },
      { key: 'customer_name', label: 'Customer Name', render: (item: any) => <span className="font-bold text-white">{item.customer_name}</span> },
      { key: 'custom_event_name', label: 'Event / Deliverable', render: (item: any) => <span className="text-zinc-200">{item.custom_event_name}</span> },
      { key: 'delivery_date', label: 'Target Delivery', render: (item: any) => <span className="font-mono text-zinc-400 text-xs">{item.delivery_date ? formatDateDDMMYY(item.delivery_date) : 'N/A'}</span> },
      { key: 'assigned_editor', label: 'Assigned Editor', render: (item: any) => <span className="font-mono text-zinc-300 text-xs font-semibold">{item.editor || item.assigned_editor || 'Unassigned'}</span> },
      { key: 'prod_status', label: 'Production Status', render: (item: any) => (
        <span className={`px-2 py-0.5 rounded-lg border font-bold font-mono text-[10px] ${
          (item.prod_status || '').toLowerCase().includes('acceptance') || (item.prod_status || '').toLowerCase().includes('approved') || (item.prod_status || '').toLowerCase().includes('complete') || (item.prod_status || '').toLowerCase().includes('delivered') || (item.prod_status || '').toLowerCase().includes('closed') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          (item.prod_status || '').toLowerCase().includes('progress') || (item.prod_status || '').toLowerCase().includes('started') || (item.prod_status || '').toLowerCase().includes('editing') || (item.prod_status || '').toLowerCase().includes('review') ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
          (item.prod_status || '').toLowerCase().includes('overdue') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
          'bg-purple-500/10 text-purple-400 border-purple-500/20'
        }`}>
          {item.prod_status || 'Pending'}
        </span>
      )},
      { key: 'proof_url', label: 'Proof Link', render: (item: any) => item.proof_url ? (
        <a href={item.proof_url} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:underline font-mono">
          View Proof
        </a>
      ) : <span className="text-zinc-500 text-xs">No Proof</span> }
    ];

    if (selectedCard === 'overview_revenue') return [...baseOrderCols, { key: 'quotation_amount', label: 'Quotation Amount', render: (item: any) => <span className="font-mono text-emerald-400 font-bold">{formatINR(item.quotation_amount || 0)}</span> }, { key: 'advance_received', label: 'Advance Received', render: (item: any) => <span className="font-mono text-zinc-400">{formatINR(item.advance_received || 0)}</span> }, actionCol];
    if (selectedCard === 'overview_active') return [...baseOrderCols, { key: 'current_stage', label: 'Current Stage', render: (item: any) => <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold font-mono text-[10px]">{item.current_stage || 'In Progress'}</span> }, actionCol];
    if (selectedCard === 'overview_approval') return [...baseOrderCols, { key: 'current_stage', label: 'Current Stage', render: (item: any) => <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold font-mono text-[10px]">{item.current_stage || 'Awaiting Approval'}</span> }, actionCol];
    if (selectedCard === 'overview_outstanding') return [...baseOrderCols, { key: 'totalRevenue', label: 'Total Revenue', render: (item: any) => <span className="font-mono text-zinc-400">{formatINR(item.totalRevenue || 0)}</span> }, { key: 'paymentReceived', label: 'Received', render: (item: any) => <span className="font-mono text-emerald-400">{formatINR(item.paymentReceived || 0)}</span> }, { key: 'outstandingAmount', label: 'Outstanding Balance', render: (item: any) => <span className="font-mono text-rose-400 font-bold">{formatINR(item.outstandingAmount || 0)}</span> }, actionCol];

    if (selectedCard && (selectedCard.startsWith('sales_') || selectedCard === 'overview_sales')) return [...baseLeadCols, actionCol];
    if (selectedCard && (selectedCard.startsWith('ops_') || selectedCard === 'overview_ops')) return [...baseOpsCols, actionCol];
    if (selectedCard && (selectedCard.startsWith('prod_') || selectedCard === 'overview_prod' || selectedCard === 'overview_acceptance')) return [...baseProdCols, actionCol];
    if (selectedCard === 'overview_closed') return [...baseOrderCols, { key: 'current_stage', label: 'Status', render: () => <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold font-mono text-[10px]">Closed & Completed</span> }, actionCol];

    return [];
  }, [selectedCard]);

  const modalTitleAndMeta = useMemo(() => {
    switch (selectedCard) {
      case 'overview_revenue': return { title: 'Total Revenue Breakdown', totalLabel: 'Total Revenue Sum', totalValue: formatINR(totalRevenue), accentColor: 'emerald' as const, filterDescription: `This list displays all ${filteredOrders.length} orders created within the active date range, contributing to the total revenue calculation.` };
      case 'overview_active': return { title: 'Active Orders Details', totalLabel: 'Active Projects Count', totalValue: `${modalData.length} Projects`, accentColor: 'blue' as const, filterDescription: 'This list displays all active projects that are currently in progress.' };
      case 'overview_approval': return { title: 'Awaiting Business Owner Approval', totalLabel: 'Awaiting Approvals Count', totalValue: `${modalData.length} Projects`, accentColor: 'amber' as const, filterDescription: 'This list displays all projects currently waiting for review and final closure.' };
      case 'overview_outstanding': return { title: 'Outstanding Payments List', totalLabel: 'Total Outstanding Balance', totalValue: formatINR(outstandingPaymentTotal), accentColor: 'rose' as const, filterDescription: 'This list displays all orders that have a non-zero outstanding balance.' };

      case 'sales_total_leads':
      case 'overview_sales': return { title: 'Total Leads Breakdown', totalLabel: 'Total Leads Count', totalValue: `${modalData.length}`, accentColor: 'amber' as const, filterDescription: 'All leads currently logged in the Sales pipeline.' };
      case 'sales_total_converted': return { title: 'Total Converted Leads', totalLabel: 'Converted Count', totalValue: `${modalData.length}`, accentColor: 'emerald' as const, filterDescription: 'Leads that have been successfully confirmed and transitioned into active orders.' };
      case 'sales_total_lost': return { title: 'Total Leads Lost', totalLabel: 'Lost Leads Count', totalValue: `${modalData.length}`, accentColor: 'rose' as const, filterDescription: 'Leads whose status has been marked as Lost.' };
      case 'sales_quotation_followup': return { title: 'Total Quotation Follow-up', totalLabel: 'Follow-up Count', totalValue: `${modalData.length}`, accentColor: 'amber' as const, filterDescription: 'Leads requiring active quotation follow-up.' };

      case 'ops_new': return { title: 'Total New Projects (Operations)', totalLabel: 'New Projects Count', totalValue: `${modalData.length}`, accentColor: 'blue' as const, filterDescription: 'New incoming shoot assignments requiring operational planning and crew deployment.' };
      case 'ops_completed': return { title: 'Total Completed Shoot Projects', totalLabel: 'Completed Count', totalValue: `${modalData.length}`, accentColor: 'emerald' as const, filterDescription: 'Shoot assignments successfully completed on location.' };
      case 'ops_upcoming': return { title: 'Total Upcoming Shoots', totalLabel: 'Upcoming Count', totalValue: `${modalData.length}`, accentColor: 'blue' as const, filterDescription: 'Scheduled shoots with future event dates.' };
      case 'ops_scheduled': return { title: 'Total Scheduled Shoots', totalLabel: 'Scheduled Count', totalValue: `${modalData.length}`, accentColor: 'blue' as const, filterDescription: 'Events where crew, equipment, and shoot timing have been scheduled.' };
      case 'overview_ops': return { title: 'Operations Pipeline Breakdown', totalLabel: 'Total Operations Count', totalValue: `${modalData.length}`, accentColor: 'blue' as const, filterDescription: 'Comprehensive overview of all operations tasks and event shoots.' };

      case 'prod_total': return { title: 'Total Production Projects', totalLabel: 'Total Projects Count', totalValue: `${modalData.length}`, accentColor: 'purple' as const, filterDescription: 'All post-production projects across all editing workflows.' };
      case 'prod_pending':
      case 'prod_new': return { title: 'Pending Production Projects', totalLabel: 'Pending Projects Count', totalValue: `${modalData.length}`, accentColor: 'amber' as const, filterDescription: 'Production projects awaiting editor allocation or editing start.' };
      case 'prod_inprogress': return { title: 'Total In Progress Editing', totalLabel: 'In Progress Count', totalValue: `${modalData.length}`, accentColor: 'orange' as const, filterDescription: 'Projects actively being edited, reviewed, or revised by production staff.' };
      case 'prod_completed':
      case 'prod_editing_completed':
      case 'prod_client_acceptance':
      case 'overview_acceptance': return { title: 'Total Completed Production Projects', totalLabel: 'Completed Count', totalValue: `${modalData.length}`, accentColor: 'emerald' as const, filterDescription: 'Projects where post-production editing is completed, delivered, or approved.' };
      case 'prod_overdue': return { title: 'Overdue Production Projects', totalLabel: 'Overdue Count', totalValue: `${modalData.length}`, accentColor: 'rose' as const, filterDescription: 'Projects whose expected delivery date has passed and are not yet completed.' };
      case 'overview_prod': return { title: 'Production Overview Breakdown', totalLabel: 'Total Production Count', totalValue: `${modalData.length}`, accentColor: 'purple' as const, filterDescription: 'Comprehensive overview of deliverables across all editing phases.' };
      case 'overview_closed': return { title: 'Closed & Completed Orders', totalLabel: 'Closed Orders Count', totalValue: `${modalData.length}`, accentColor: 'emerald' as const, filterDescription: 'Projects successfully completed, fully paid, and closed.' };

      default: return { title: 'Detail View', totalLabel: 'Total Count', totalValue: `${modalData.length}`, accentColor: 'amber' as const, filterDescription: 'Detailed view of matching records.' };
    }
  }, [selectedCard, totalRevenue, outstandingPaymentTotal, modalData.length, filteredOrders.length]);
  // Review & Close Modal State
  const [reviewModalOrder, setReviewModalOrder] = useState<Order | null>(null);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);

  // Calendar Event Selection Modal State
  const [calendarEventModal, setCalendarEventModal] = useState<any | null>(null);
  
  // Quotation Unlock Request Modal State
  const [unlockRequestModal, setUnlockRequestModal] = useState<any | null>(null);
  
  const handleApproveUnlock = async (request: any) => {
    try {
      console.log("[DEBUG handleApproveUnlock] Step 1: Read unlock request:", request);
      if (!request) {
        throw new Error("No unlock request selected.");
      }

      const targetLeadId = request.lead_id || request.order_id;
      const targetOrderId = request.order_id || request.lead_id;

      // Find order or lead in props
      let order = (orders || []).find(o => o.order_id === targetOrderId || o.lead_id === targetLeadId || o.order_id === targetLeadId);
      let lead = (leads || []).find(l => l.lead_id === targetLeadId || l.lead_id === targetOrderId);

      // If not in memory props, fetch directly from Supabase
      if (!order && !lead && supabaseClient) {
        if (targetLeadId) {
          const { data: dbLeads, error: leadFetchErr } = await supabaseClient
            .from('leads')
            .select('*')
            .or(`lead_id.eq.${targetLeadId}`);
          if (leadFetchErr) console.warn("[DEBUG handleApproveUnlock] Lead fetch warning:", leadFetchErr.message);
          if (dbLeads && dbLeads.length > 0) {
            lead = dbLeads[0];
          }
        }

        if (targetOrderId) {
          const { data: dbOrders, error: orderFetchErr } = await supabaseClient
            .from('orders')
            .select('*')
            .or(`order_id.eq.${targetOrderId}`);
          if (orderFetchErr) console.warn("[DEBUG handleApproveUnlock] Order fetch warning:", orderFetchErr.message);
          if (dbOrders && dbOrders.length > 0) {
            order = dbOrders[0];
          }
        }
      }

      const effectiveLeadId = lead?.lead_id || order?.lead_id || targetLeadId;
      const effectiveOrderId = order?.order_id || targetOrderId;

      console.log("[DEBUG handleApproveUnlock] Step 2: Find lead/order:", { effectiveLeadId, effectiveOrderId, lead, order });

      if (!effectiveLeadId && !effectiveOrderId) {
        throw new Error("Target Lead or Order record could not be found.");
      }

      // 1. Update unlock_requests status to Approved
      console.log("[DEBUG handleApproveUnlock] Step 3: Update unlock_requests status to Approved");
      if (supabaseClient) {
        let reqQuery = supabaseClient.from('unlock_requests').update({ 
           request_status: 'Approved',
           status: 'Approved',
           approved_at: new Date().toISOString(),
           approved_by: currentUserName || 'Business Owner'
        });

        if (request.request_id) {
          reqQuery = reqQuery.eq('request_id', request.request_id);
        } else if ((request as any).id) {
          reqQuery = reqQuery.eq('id', (request as any).id);
        } else if (effectiveOrderId && effectiveLeadId) {
          reqQuery = reqQuery.or(`order_id.eq.${effectiveOrderId},lead_id.eq.${effectiveLeadId}`);
        } else if (effectiveLeadId) {
          reqQuery = reqQuery.eq('lead_id', effectiveLeadId);
        } else if (effectiveOrderId) {
          reqQuery = reqQuery.eq('order_id', effectiveOrderId);
        }

        const { error: updErr } = await reqQuery;

        if (updErr) {
          console.error("[DEBUG handleApproveUnlock] unlock_requests update error:", updErr);
          throw new Error(`Failed to update unlock request status: ${updErr.message}`);
        }

        // 2. Update lead in Supabase: set quotation_locked = false
        if (effectiveLeadId) {
          const { error: leadErr } = await supabaseClient
            .from('leads')
            .update({ quotation_locked: false, updated_at: new Date().toISOString() })
            .eq('lead_id', effectiveLeadId);
          if (leadErr) {
            console.warn("[DEBUG handleApproveUnlock] leads table quotation_locked=false update warning:", leadErr.message);
          } else {
            console.log("[DEBUG handleApproveUnlock] Successfully updated lead quotation_locked = false for", effectiveLeadId);
          }
        }
      }

      // 4. Log activity
      if (typeof logActivity === 'function') {
        try {
          logActivity(
            'Approved Quotation Unlock',
            'Business Owner',
            effectiveOrderId || effectiveLeadId || 'N/A',
            `Approved unlock for Lead ${effectiveLeadId} / Order ${effectiveOrderId}`
          );
        } catch (logErr: any) {
          console.warn("[DEBUG handleApproveUnlock] logActivity warning:", logErr?.message || logErr);
        }
      }

      // 5. Send notification to Sales Staff
      console.log("[DEBUG handleApproveUnlock] Step 5: Send notification to Sales Staff");
      if (supabaseClient) {
        const { error: ntfErr } = await supabaseClient.from('notifications').insert({
          notification_id: `NTF-${Math.floor(Math.random() * 100000)}`,
          title: "Quotation Unlocked",
          message: `Your request to unlock quotation for ${request.customer_name || 'lead'} (${effectiveLeadId}) has been approved.`,
          notification_type: 'Alert',
          read_status: false,
          is_read: false,
          recipient_role: 'Sales Team',
          recipient_user_id: request.sales_staff_id || request.requested_by_user_id || null,
          project_id: effectiveOrderId || effectiveLeadId
        });

        if (ntfErr) {
          console.warn("[DEBUG handleApproveUnlock] notification insert warning:", ntfErr.message);
        }
      }

      // 6. Refresh UI
      console.log("[DEBUG handleApproveUnlock] Step 6: Refresh UI");
      setUnlockRequests(prev => Array.isArray(prev) ? prev.filter(r => r.request_id !== request.request_id && r.order_id !== effectiveOrderId && r.lead_id !== effectiveLeadId) : []);
      setUnlockRequestModal(null);
      alert("Quotation has been successfully unlocked.");
    } catch (err: any) {
      console.error("[DEBUG handleApproveUnlock ERROR]:", err);
      if (err && err.stack) {
        console.error("Stack trace:", err.stack);
      }
      alert(err.message || String(err) || "Failed to approve unlock");
    }
  };

  const handleRejectUnlock = async (request: any) => {
    try {
      if (!request) return;
      const targetLeadId = request.lead_id || request.order_id;
      const targetOrderId = request.order_id || request.lead_id;

      if (supabaseClient) {
        let reqQuery = supabaseClient.from('unlock_requests').update({ 
          request_status: 'Rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: currentUserName || 'Business Owner'
        });

        if (request.request_id) {
          reqQuery = reqQuery.eq('request_id', request.request_id);
        } else if (targetOrderId && targetLeadId) {
          reqQuery = reqQuery.or(`order_id.eq.${targetOrderId},lead_id.eq.${targetLeadId}`);
        } else if (targetLeadId) {
          reqQuery = reqQuery.eq('lead_id', targetLeadId);
        } else if (targetOrderId) {
          reqQuery = reqQuery.eq('order_id', targetOrderId);
        }

        const { error: updErr } = await reqQuery;
        if (updErr) throw new Error(`Supabase error rejecting unlock request: ${updErr.message}`);
      }
        
      if (typeof logActivity === 'function') {
        try {
          logActivity(
            'Rejected Quotation Unlock',
            'Business Owner',
            targetOrderId || targetLeadId || 'N/A',
            `Rejected unlock for Lead ${targetLeadId} / Order ${targetOrderId}`
          );
        } catch (logErr: any) {
          console.warn("logActivity warning:", logErr?.message || logErr);
        }
      }
      
      // Notify Sales Staff
      if (supabaseClient) {
        await supabaseClient.from('notifications').insert({
          notification_id: `NTF-${Math.floor(Math.random() * 100000)}`,
          title: "Quotation Unlock Rejected",
          message: `Your request to unlock quotation for ${request.customer_name || 'lead'} (${targetLeadId}) was rejected.`,
          notification_type: 'Alert',
          read_status: false,
          is_read: false,
          recipient_role: 'Sales Team',
          recipient_user_id: request.sales_staff_id || request.requested_by_user_id || null,
          project_id: targetOrderId || targetLeadId
        });
      }

      setUnlockRequests(prev => prev.filter(r => r.request_id !== request.request_id && r.order_id !== targetOrderId && r.lead_id !== targetLeadId));
      setUnlockRequestModal(null);
      alert("Quotation unlock request has been rejected.");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to reject unlock");
    }
  };

  // Handle Approve & Close Order Action
  const handleApproveAndCloseOrder = async (order: Order) => {
    if (currentRole !== 'Business Owner') {
      alert("Only the Business Owner role can close orders.");
      return;
    }

    try {
      const lead = leads.find(l => l.lead_id === order.lead_id || l.lead_id === order.order_id);
      const prod = production.find(p => 
        p.tracking_id === order.lead_id || 
        p.order_id === order.lead_id || 
        p.tracking_id === order.order_id ||
        p.order_id === order.order_id ||
        p.production_id === order.order_id ||
        p.production_id === order.lead_id ||
        p.lead_id === order.lead_id ||
        p.production_id === `PRD-${order.lead_id}` ||
        p.production_id === `PRD-${order.order_id}`
      );

      const targetProdId = prod ? prod.production_id : (`PRD-${order.lead_id || order.order_id}`);

      // 1. Call context update function
      if (updateOrderStage) {
        await updateOrderStage(order.order_id, 'Order Closed');
      }

      if (updateProduction) {
        await updateProduction(targetProdId, {
          editing_status: 'Order Closed',
          production_status: 'Order Closed',
          current_status: 'Order Closed',
          remarks: `Final Approval granted & Order Closed by Business Owner (${currentUserName || 'Business Owner'}) on ${formatDateDDMMYY(new Date())}`
        } as any);
      }

      // 2. Direct Supabase update to ensure database persistence
      if (supabaseClient) {
        const timestamp = new Date().toISOString();
        const userName = currentUserName || 'Business Owner';

        const { error: errOrd } = await supabaseClient
          .from('orders')
          .update({ current_stage: 'Order Closed', updated_by: userName, updated_at: timestamp })
          .eq('order_id', order.order_id);
        if (errOrd) throw new Error("Orders update error: " + errOrd.message);

        const targetLeadId = order.lead_id || order.order_id;
        if (targetLeadId) {
          const { error: errLead } = await supabaseClient
            .from('leads')
            .update({ status: 'Order Closed', current_status: 'Order Closed', updated_by: userName, updated_at: timestamp })
            .eq('lead_id', targetLeadId);
          if (errLead) throw new Error("Leads update error: " + errLead.message);
        }

        const { error: errProd } = await supabaseClient
          .from('production')
          .update({ editing_status: 'Order Closed', production_status: 'Order Closed', current_status: 'Order Closed' })
          .eq('production_id', targetProdId);
        if (errProd) console.warn("[handleApproveAndCloseOrder] production update warning:", errProd);

        const { error: errEa } = await supabaseClient
          .from('editor_assignments')
          .update({ status: 'Completed' })
          .eq('production_id', targetProdId);
        if (errEa) console.warn("[handleApproveAndCloseOrder] editor_assignments update warning:", errEa);
      }

      if (logActivity) {
        logActivity(
          `Order ${order.order_id} approved & closed by Business Owner (${currentUserName || 'Business Owner'}). Status updated to Order Closed.`,
          'Business Owner',
          order.order_id,
          'Business Owner Review',
          'Order Closed'
        );
      }

      if (refreshData) {
        await refreshData();
      }

      setApprovalFeedback(`Order ${order.order_id} (${order.customer_name}) has been successfully approved and closed.`);
      setReviewModalOrder(null);
      setCalendarEventModal(null);
      setTimeout(() => setApprovalFeedback(null), 5000);
    } catch (err: any) {
      console.error("[handleApproveAndCloseOrder] Error approving order:", err);
      throw err;
    }
  };

  // Handle Reject Back to Production
  const handleRejectBackToProduction = async (order: Order) => {
    const prod = production.find(p => p.tracking_id === order.lead_id || p.order_id === order.lead_id || p.tracking_id === order.order_id || p.order_id === order.order_id);
    
    if (updateOrderStage) {
      await updateOrderStage(order.order_id, 'Production' as any);
    }
    
    if (prod && updateProduction) {
      await updateProduction(prod.production_id, {
        editing_status: 'Assigned Editor' as any,
        production_status: 'In Progress' as any,
        remarks: `Rejected back to Production by Business Owner (${currentUserName || 'Business Owner'}) on ${formatDateDDMMYY(new Date())}`
      });
      
      if (supabaseClient) {
        await supabaseClient
          .from('editor_assignments')
          .update({ status: 'Assigned' })
          .eq('production_id', prod.production_id);
      }
    }

    if (logActivity) {
      logActivity(
        `Order ${order.order_id} rejected and sent back to production by Business Owner.`,
        'Business Owner',
        order.order_id,
        'Business Owner Review',
        'Production'
      );
    }

    setApprovalFeedback(`Order ${order.order_id} has been rejected back to production.`);
    setReviewModalOrder(null);
    setCalendarEventModal(null);
    setTimeout(() => setApprovalFeedback(null), 5000);
  };

  return (
    <div className="space-y-6 text-zinc-100 font-sans pb-12">
      
      {/* Toast / Notification Banner */}
      {approvalFeedback && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 shadow-lg animate-in fade-in duration-300 mb-4">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{approvalFeedback}</span>
        </div>
      )}

      {/* Business Owner Dashboard Header / User Info */}
      <div className="border-b border-zinc-900 pb-5">
        <DashboardGreetingHeader
          dashboardTitle="Business Owner Dashboard"
          userName={businessOwnerName}
          userMobile={loggedInBusinessOwnerMobile}
        />
      </div>

      {/* SECTION 1: BUSINESS OVERVIEW */}
      {currentSection === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">


          {/* Section Header & Date Filter */}
          <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-amber-400 font-mono flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                <span>BUSINESS OVERVIEW</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Key Performance Indicators across revenue, active projects, and pending approvals.
              </p>
            </div>

            {/* Filter toggle button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showFilters ? 'border-amber-500/40 text-amber-400 bg-amber-500/5' : 'border-zinc-800 text-zinc-400'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>
          </div>

          {/* Collapsible Date Filter Bar */}
          {showFilters && (
            <div className="bg-zinc-950/40 border border-zinc-900 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in shadow-inner">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-mono">
                  <button
                    onClick={() => handlePresetChange('this_month')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${datePreset === 'this_month' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => handlePresetChange('last_month')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${datePreset === 'last_month' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Last Month
                  </button>
                  <button
                    onClick={() => handlePresetChange('last_3_months')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${datePreset === 'last_3_months' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Last 3 Months
                  </button>
                  <button
                    onClick={() => handlePresetChange('this_year')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${datePreset === 'this_year' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    This Year
                  </button>
                  <button
                    onClick={() => handlePresetChange('all')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${datePreset === 'all' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    All Time
                  </button>
                  <button
                    onClick={() => setDatePreset('custom')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${datePreset === 'custom' ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Custom
                  </button>
                </div>

                {datePreset === 'custom' && (
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <div className="w-32">
                      <DateFilterInput
                        value={startDate}
                        onChange={setStartDate}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 text-xs"
                      />
                    </div>
                    <span className="text-zinc-600">to</span>
                    <div className="w-32">
                      <DateFilterInput
                        value={endDate}
                        onChange={setEndDate}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Active Date Range Display */}
              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 bg-zinc-900/60 border border-zinc-800/80 px-3 py-1.5 rounded-xl">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-500 font-bold uppercase text-[10px]">Active Range:</span>
                <span className="text-zinc-200 font-bold">
                  {datePreset === 'all' ? 'All Time' : `${formatDateDDMMYY(startDate)} – ${formatDateDDMMYY(endDate)}`}
                </span>
              </div>
            </div>
          )}

          {/* BUSINESS OVERVIEW 12 CARDS SECTION */}
          <div className="space-y-6">
            
            {/* SALES PERFORMANCE */}
            <div className="space-y-3">
              <h3 className="text-xs font-black font-mono tracking-wider text-amber-400 uppercase">Sales Performance</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <CameraLensStatsCard
                  label="Total Leads"
                  val={boCardsData.salesTotalLeads.length}
                  theme="amber"
                  trendText="All Inquiries"
                  lensLabel="PRIME 24mm"
                  chartPoints={[10, 18, 14, 22, 19, 28, 25]}
                  onClick={() => setSelectedCard('sales_total_leads')}
                />
                <CameraLensStatsCard
                  label="Total Converted"
                  val={boCardsData.salesConverted.length}
                  theme="green"
                  trendText="Confirmed Deals"
                  lensLabel="PRIME 35mm"
                  chartPoints={[8, 12, 15, 20, 24, 30, 32]}
                  onClick={() => setSelectedCard('sales_total_converted')}
                />
                <CameraLensStatsCard
                  label="Total Leads Lost"
                  val={boCardsData.salesLost.length}
                  theme="red"
                  trendText="Closed / Lost"
                  lensLabel="TELE 85mm"
                  chartPoints={[5, 4, 6, 3, 5, 2, 4]}
                  onClick={() => setSelectedCard('sales_total_lost')}
                />
                <CameraLensStatsCard
                  label="Total Quotation Follow-up"
                  val={boCardsData.salesFollowup.length}
                  theme="gold"
                  trendText="In Negotiation"
                  lensLabel="CINE 50mm"
                  chartPoints={[12, 15, 11, 18, 14, 20, 17]}
                  onClick={() => setSelectedCard('sales_quotation_followup')}
                />
              </div>
            </div>

            {/* OPERATIONS PERFORMANCE */}
            <div className="space-y-3">
              <h3 className="text-xs font-black font-mono tracking-wider text-blue-400 uppercase">Operations Performance</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <CameraLensStatsCard
                  label="Total New Projects"
                  val={boCardsData.opsNew.length}
                  theme="blue"
                  trendText="Awaiting Allocation"
                  lensLabel="PRIME 24mm"
                  chartPoints={[6, 10, 8, 14, 12, 18, 16]}
                  onClick={() => setSelectedCard('ops_new')}
                />
                <CameraLensStatsCard
                  label="Total Completed Shoot Projects"
                  val={boCardsData.opsCompleted.length}
                  theme="green"
                  trendText="Shoots Wrapped"
                  lensLabel="PRIME 50mm"
                  chartPoints={[14, 18, 22, 28, 32, 38, 42]}
                  onClick={() => setSelectedCard('ops_completed')}
                />
                <CameraLensStatsCard
                  label="Total Upcoming Shoots"
                  val={boCardsData.opsUpcoming.length}
                  theme="cyan"
                  trendText="Scheduled Fleet"
                  lensLabel="TELE 135mm"
                  chartPoints={[8, 12, 10, 16, 14, 20, 19]}
                  onClick={() => setSelectedCard('ops_upcoming')}
                />
                <CameraLensStatsCard
                  label="Total Scheduled"
                  val={boCardsData.opsScheduled.length}
                  theme="indigo"
                  trendText="Crew Assigned"
                  lensLabel="ZOOM 24-70"
                  chartPoints={[10, 14, 12, 18, 16, 22, 21]}
                  onClick={() => setSelectedCard('ops_scheduled')}
                />
              </div>
            </div>

            {/* PRODUCTION OVERVIEW */}
            <div className="space-y-3">
              <h3 className="text-xs font-black font-mono tracking-wider text-pink-400 uppercase">Production Overview</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <CameraLensStatsCard
                  label="Total Production Projects"
                  val={boCardsData.prodTotal.length}
                  theme="purple"
                  trendText="All Deliverables"
                  lensLabel="PROD-ALL 35"
                  chartPoints={[5, 9, 7, 13, 11, 17, boCardsData.prodTotal.length || 15]}
                  onClick={() => setSelectedCard('prod_total')}
                />
                <CameraLensStatsCard
                  label="Pending Production Projects"
                  val={boCardsData.prodPending.length}
                  theme="amber"
                  trendText="Awaiting Editor"
                  lensLabel="PEND-28"
                  chartPoints={[4, 7, 5, 10, 8, 12, boCardsData.prodPending.length || 6]}
                  onClick={() => setSelectedCard('prod_pending')}
                />
                <CameraLensStatsCard
                  label="In Progress"
                  val={boCardsData.prodInProgress.length}
                  theme="orange"
                  trendText="Active Editing"
                  lensLabel="V-EDIT 50"
                  chartPoints={[8, 14, 11, 19, 16, 24, boCardsData.prodInProgress.length || 22]}
                  onClick={() => setSelectedCard('prod_inprogress')}
                />
                <CameraLensStatsCard
                  label="Completed"
                  val={boCardsData.prodCompleted.length}
                  theme="green"
                  trendText="Delivered & Closed"
                  lensLabel="MASTER 85"
                  chartPoints={[12, 16, 14, 22, 20, 26, boCardsData.prodCompleted.length || 28]}
                  onClick={() => setSelectedCard('prod_completed')}
                />
                <CameraLensStatsCard
                  label="Overdue Projects"
                  val={boCardsData.prodOverdue.length}
                  theme="red"
                  trendText="Past Due Date"
                  lensLabel="ALERT 100"
                  chartPoints={[2, 4, 3, 6, 5, 8, boCardsData.prodOverdue.length]}
                  onClick={() => setSelectedCard('prod_overdue')}
                />
              </div>
            </div>

          </div>

          {/* Quick Overview Summary Banner */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Executive Operations Status</span>
              </h3>
              <p className="text-xs text-zinc-400">
                {waitingApprovalOrders.length > 0 
                  ? `There are currently ${waitingApprovalOrders.length} projects waiting for your review and final closure.`
                  : 'All client-accepted projects have been reviewed and closed! No pending approvals at this time.'}
              </p>
            </div>

            {waitingApprovalOrders.length > 0 && (
              <button
                onClick={() => handleSectionSwitch('approval')}
                className="px-4 py-2 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition-all flex items-center gap-2 shadow-lg cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Review Pending Orders ({waitingApprovalOrders.length})</span>
              </button>
            )}
          </div>

        </div>
      )}

      {/* SECTION 2: EVENT CALENDAR */}
      {currentSection === 'calendar' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Calendar Component Wrapper */}
          <BusinessOwnerCalendarView 
            orders={orders}
            production={production}
            leads={leads}
            onSelectEvent={(eventData) => setCalendarEventModal(eventData)}
          />

        </div>
      )}

      {/* SECTION 3: ORDERS AWAITING FINAL APPROVAL / UNLOCK REQUESTS */}
      {currentSection === 'approval' && (
        <div className="space-y-6 animate-in fade-in duration-200">

          {/* QUOTATION UNLOCK REQUESTS */}
          {unlockRequests.length > 0 && (
            <div className="space-y-4 mb-8">
              <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-amber-400 font-mono flex items-center gap-2">
                    <Ban className="w-4 h-4" />
                    <span>QUOTATION UNLOCK REQUESTS</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Sales staff requests to unlock quotations for editing.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-400">Total Pending:</span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold">
                    {unlockRequests.length} Requests
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-max">
                    <thead>
                      <tr className="bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4">Lead ID</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Sales Staff</th>
                        <th className="py-3 px-4">Reason</th>
                        <th className="py-3 px-4">Request Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {[...unlockRequests].sort((a, b) => compareRecordsByDate(a, b, 'latest')).map(request => {
                        const orderDetails = orders.find(o => o.order_id === request.order_id || o.lead_id === request.lead_id);
                        const leadDetails = leads.find(l => l.lead_id === request.lead_id || (request.order_id && l.lead_id === request.order_id));

                        const customerName = 
                          request.customer_name || 
                          leadDetails?.customer_name || 
                          orderDetails?.customer_name || 
                          (request.action_url ? (() => { try { return JSON.parse(request.action_url).customer_name; } catch(e) { return null; } })() : null) || 
                          '-';

                        const orderId = request.order_id || orderDetails?.order_id || '-';
                        const leadId = request.lead_id || leadDetails?.lead_id || '-';

                        const staffName = 
                          request.sales_staff_name || 
                          request.requested_by_name || 
                          leadDetails?.sales_person || 
                          orderDetails?.sales_person || 
                          (request.action_url ? (() => { try { return JSON.parse(request.action_url).sales_staff_name; } catch(e) { return null; } })() : null) || 
                          'Sales Staff';

                        const staffMobile = 
                          request.sales_staff_mobile || 
                          leadDetails?.sales_staff_mobile || 
                          leadDetails?.mobile || 
                          (request.action_url ? (() => { try { return JSON.parse(request.action_url).sales_staff_mobile; } catch(e) { return null; } })() : null) || 
                          '-';

                        const reqReason = request.reason || request.request_reason || request.title || 'Quotation unlock requested';
                        const reqStatus = request.status || request.request_status || 'Pending';
                        const reqDate = (request.requested_at || request.created_at) ? formatDateDDMMYY(request.requested_at || request.created_at) : '-';

                        return (
                          <tr key={request.request_id || request.order_id} className="hover:bg-zinc-900/50 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-amber-400">{orderId}</td>
                            <td className="py-3 px-4 font-mono text-xs text-indigo-400 font-semibold">{leadId}</td>
                            <td className="py-3 px-4 text-zinc-100 font-bold text-sm">{customerName}</td>
                            <td className="py-3 px-4 text-zinc-300">
                              <div className="font-semibold text-zinc-200">{staffName}</div>
                              <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{staffMobile}</div>
                            </td>
                            <td className="py-3 px-4 text-zinc-300">
                              <div className="font-medium text-amber-200/90">{reqReason}</div>
                              {request.custom_reason && <div className="text-[10px] text-zinc-400 mt-0.5">{request.custom_reason}</div>}
                            </td>
                            <td className="py-3 px-4 text-zinc-400 font-mono text-xs">{reqDate}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                                {reqStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setUnlockRequestModal({
                                  ...request,
                                  customer_name: customerName,
                                  lead_id: leadId,
                                  order_id: orderId,
                                  sales_staff_name: staffName,
                                  sales_staff_mobile: staffMobile,
                                  reason: reqReason
                                })}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded shadow text-xs font-bold transition-colors cursor-pointer"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          
          {/* SECTION 3: ORDERS AWAITING FINAL APPROVAL */}
          {waitingApprovalOrders.length > 0 && (
            <div className="space-y-4">
              <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    <span>ORDERS AWAITING FINAL APPROVAL</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Projects with Client Acceptance status waiting for final Business Owner approval and closure.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-400">Total Pending:</span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold">
                    {waitingApprovalOrders.length} Projects
                  </span>
                </div>
              </div>

              {/* Waiting Approval Table */}
              <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-max">
                    <thead>
                      <tr className="bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4">Customer Name</th>
                        <th className="py-3 px-4">Event Name</th>
                        <th className="py-3 px-4">Assigned Staff</th>
                        <th className="py-3 px-4">Payment Status</th>
                        <th className="py-3 px-4">Outstanding Balance</th>
                        <th className="py-3 px-4">Current Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {waitingApprovalOrders.map(order => {
                        const prod = production.find(p => p.tracking_id === order.lead_id || p.order_id === order.lead_id || p.tracking_id === order.order_id || p.order_id === order.order_id || p.production_id === order.order_id || p.production_id === order.lead_id);
                        const pay = payments.find(p => p.order_id === order.order_id || p.lead_id === order.lead_id);
                        const lead = leads.find(l => l.lead_id === order.lead_id || l.lead_id === order.order_id);
                        
                        const { finalQuotation: totalQuotation, remaining: balanceDue, payStatus } = getOrderRemainingPendingAmount(
                          order,
                          orders,
                          leads,
                          payments,
                          paymentHistory
                        );
                        const customerMobile = order.customer_phone || order.mobile || lead?.phone || lead?.mobile || pay?.customer_phone || 'N/A';

                        return (
                          <tr key={order.order_id} className="hover:bg-zinc-900/50 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                              {order.order_id}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-zinc-200">
                              <div>{order.customer_name}</div>
                              {customerMobile !== 'N/A' && (
                                <div className="text-[10px] text-zinc-400 font-mono font-normal">{customerMobile}</div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-zinc-300">
                              <div className="font-semibold text-zinc-200">{order.custom_event_name || order.event_type || 'Photography & Videography'}</div>
                              {order.event_date && (
                                <div className="text-[10px] text-zinc-400 font-mono">{formatDateDDMMYY(order.event_date)}</div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-sans">
                              <AssignedStaffDropdown orderId={order.order_id} leadId={order.lead_id} order={order} lead={lead} productionItem={prod} />
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                                payStatus === 'Fully Paid'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : payStatus === 'Partially Paid'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}>
                                {payStatus}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-zinc-200">
                              <div className={balanceDue <= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatINR(balanceDue)}</div>
                              <div className="text-[10px] text-zinc-400 font-mono">Quotation: {formatINR(totalQuotation)}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold">
                                {prod?.editing_status || order.current_stage || 'Client Acceptance'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedHistoryOrder(order)}
                                  className="px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5"
                                  title="View Project History & Timeline"
                                >
                                  <History className="w-3.5 h-3.5" />
                                  <span>History</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReviewModalOrder(order)}
                                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-black font-black hover:bg-amber-400 transition-all cursor-pointer text-xs flex items-center gap-1.5 shadow-md"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Review</span>
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
            </div>
          )}

          {/* Fallback empty state when both unlock requests and waiting approval orders are 0 */}
          {unlockRequests.length === 0 && waitingApprovalOrders.length === 0 && (
            <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-12 text-center space-y-3 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">No Pending Approvals or Requests</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                There are currently no quotation unlock requests from sales staff or orders awaiting final Business Owner approval.
              </p>
            </div>
          )}

        </div>
      )}

      {/* SECTION 4: REVENUE & PAYMENT SUMMARY */}
      {currentSection === 'summary' && (
        <RevenuePaymentSummarySection 
          orders={orders}
          payments={payments}
          leads={leads}
          production={production}
        />
      )}

      {/* SECTION 5: STAFF PERFORMANCE */}
      {currentSection === 'staff_performance' && (
        <OwnerStaffPerformanceReport />
      )}

      {/* SECTION: LEADS REPORT */}
      {currentSection === 'leads_report' && (
        <LeadsReportSection leads={leads} />
      )}

      {/* SECTION 6: PASSWORD RESET */}
      {currentSection === 'password_reset' && (
        <OwnerPasswordResetModule />
      )}

      {/* CARD DETAIL POPUP/MODAL */}
      <BusinessOwnerCardDetailModal
        isOpen={selectedCard !== null}
        onClose={() => setSelectedCard(null)}
        title={modalTitleAndMeta.title}
        subtitle={startDate && endDate ? `${formatDateDDMMYY(startDate)} – ${formatDateDDMMYY(endDate)}` : ''}
        accentColor={modalTitleAndMeta.accentColor}
        data={modalData}
        columns={modalColumns}
        totalLabel={modalTitleAndMeta.totalLabel}
        totalValue={modalTitleAndMeta.totalValue}
        filterDescription={modalTitleAndMeta.filterDescription}
      />

      {/* REVIEW & CLOSE MODAL */}
      {reviewModalOrder && (
        <ReviewAndCloseModal 
          order={reviewModalOrder}
          leads={leads}
          production={production}
          payments={payments}
          currentRole={currentRole}
          onClose={() => setReviewModalOrder(null)}
          onApprove={() => handleApproveAndCloseOrder(reviewModalOrder)}
          onReject={() => handleRejectBackToProduction(reviewModalOrder)}
        />
      )}

      {/* UNLOCK REQUEST REVIEW MODAL */}
      {unlockRequestModal && (
        <UnlockRequestReviewModal 
          unlockRequestModal={unlockRequestModal}
          onClose={() => setUnlockRequestModal(null)}
          onReject={(item) => handleRejectUnlock(item)}
          onApprove={(item) => handleApproveUnlock(item)}
        />
      )}

      {/* CALENDAR EVENT DETAIL MODAL */}
      {calendarEventModal && (
        <CalendarEventDetailModal 
          event={calendarEventModal}
          onClose={() => setCalendarEventModal(null)}
          onReviewAndClose={(orderObj) => {
            setCalendarEventModal(null);
            setReviewModalOrder(orderObj);
          }}
        />
      )}

      {/* UNIFIED ORDER HISTORY & TIMELINE AUDIT MODAL */}
      <OrderHistoryModal
        isOpen={selectedHistoryOrder !== null}
        onClose={() => setSelectedHistoryOrder(null)}
        order={selectedHistoryOrder}
      />

    </div>
  );
};

/* ============================================================================
   CALENDAR COMPONENT FOR SECTION 2
   ============================================================================ */
interface BusinessOwnerCalendarViewProps {
  orders: Order[];
  production: Production[];
  leads: any[];
  onSelectEvent: (eventData: any) => void;
}

const BusinessOwnerCalendarView: React.FC<BusinessOwnerCalendarViewProps> = ({
  orders,
  production,
  leads,
  onSelectEvent
}) => {
  const { globalDateRange } = useRole();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Helper to normalize any date input format to standard YYYY-MM-DD without timezone shifts
  const normalizeToYYYYMMDD = useCallback((dateVal: any): string | null => {
    if (!dateVal) return null;
    if (dateVal instanceof Date) {
      if (isNaN(dateVal.getTime())) return null;
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    
    let str = String(dateVal).trim();
    if (!str || str === 'undefined' || str === 'null' || str === '—' || str === 'N/A' || str === 'TBD') return null;

    if (str.includes('T')) {
      str = str.split('T')[0];
    }
    str = str.split(/\s+/)[0];

    // Standardize separators (/ and . to -)
    str = str.replace(/[\/\.]/g, '-');

    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (parts[2].length === 4) {
          // DD-MM-YYYY
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }
    try {
      const dObj = new Date(str);
      if (!isNaN(dObj.getTime())) {
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (e) {}
    return null;
  }, []);

  // Filter state (Hidden by default)
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    eventDates: true,
    deliveryDates: true,
    clientAcceptance: true,
    waitingApproval: true,
  });
  const [draftFilters, setDraftFilters] = useState({
    eventDates: true,
    deliveryDates: true,
    clientAcceptance: true,
    waitingApproval: true,
  });

  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && filterDropdownRef.current && !filterDropdownRef.current.contains(target)) {
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

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

  const year = selectedYear;
  const month = selectedMonth;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Navigate Months
  const prevMonth = () => {
    if (month === 0) {
      setSelectedYear(year - 1);
      setSelectedMonth(11);
    } else {
      setSelectedMonth(month - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setSelectedYear(year + 1);
      setSelectedMonth(0);
    } else {
      setSelectedMonth(month + 1);
    }
  };
  const todayMonth = () => {
    setSelectedYear(new Date().getFullYear());
    setSelectedMonth(new Date().getMonth());
  };

  // Filter actions
  const handleApplyFilters = () => {
    setActiveFilters(draftFilters);
    setIsFilterOpen(false);
  };

  const handleResetFilters = () => {
    const allEnabled = {
      eventDates: true,
      deliveryDates: true,
      clientAcceptance: true,
      waitingApproval: true,
    };
    setDraftFilters(allEnabled);
    setActiveFilters(allEnabled);
  };

  // Generate Days Grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  // Combine events from orders & production filtered by activeFilters
  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};

    // Build unified collection of orders and leads
    const combinedMap = new Map<string, { order?: Order; lead?: any }>();
    (leads || []).forEach(l => {
      if (!l) return;
      const key = l.lead_id || (l as any).order_id;
      if (key) combinedMap.set(key, { lead: l });
    });
    (orders || []).forEach(o => {
      if (!o) return;
      const key = o.lead_id || o.order_id;
      if (key && combinedMap.has(key)) {
        combinedMap.get(key)!.order = o;
      } else if (o.order_id && combinedMap.has(o.order_id)) {
        combinedMap.get(o.order_id)!.order = o;
      } else {
        combinedMap.set(o.order_id || o.lead_id, { order: o });
      }
    });

    combinedMap.forEach(({ order, lead: matchedLead }) => {
      const lead = matchedLead || (leads ? leads.find(l => (order && (l.lead_id === order.lead_id || l.lead_id === order.order_id || (l.order_id && l.order_id === order.order_id)))) : undefined);
      const orderId = order?.order_id || lead?.order_id || lead?.lead_id;
      const leadId = lead?.lead_id || order?.lead_id || orderId;

      const prod = production?.find(p => 
        p.tracking_id === leadId || 
        p.order_id === leadId || 
        p.tracking_id === orderId || 
        (p as any).order_id === orderId ||
        (p.production_id && (p.production_id === lead?.production_id || p.production_id === (lead as any)?.prod_id))
      );

      const rawLeadEvents = lead?.events && Array.isArray(lead.events) && lead.events.length > 0 ? lead.events : [];
      const deserialized = (!rawLeadEvents || rawLeadEvents.length === 0) && (lead?.notes_special_customizations || order?.notes_special_customizations)
        ? deserializeLeadEvents(lead?.notes_special_customizations || order?.notes_special_customizations).events
        : [];
      const combinedEvents = rawLeadEvents.length > 0 ? rawLeadEvents : (deserialized.length > 0 ? deserialized : []);
      const eventsToMap = combinedEvents.length > 0 ? combinedEvents : [{
        id: `event-${orderId}`,
        event_date: order?.event_date || lead?.event_date || '',
        event_name: order?.custom_event_name || order?.event_type || lead?.custom_event_name || lead?.event_type || 'Event Shoot',
        event_type: order?.event_type || lead?.event_type || 'Shoot',
        event_location: order?.event_location || lead?.event_location || 'Studio',
        target_delivery_date: (order as any)?.target_delivery_date || lead?.delivery_target_date || ''
      }];

      const currentStage = (order?.current_stage || prod?.editing_status || prod?.production_status || lead?.status || lead?.current_status || 'Event Scheduled').trim();

      const isWaitingApproval = [
        'Client Acceptance',
        'Business Owner Review',
        'Customer Review',
        'Editing Complete',
        'Final Approval'
      ].some(st => st.toLowerCase() === currentStage.toLowerCase());

      const isClientAcceptance = [
        'Client Acceptance',
        'Final Approval',
        'Approved'
      ].some(st => st.toLowerCase() === currentStage.toLowerCase());

      const baseTargetedDate = normalizeToYYYYMMDD(
        prod?.target_delivery_date ||
        prod?.expected_delivery_date ||
        prod?.delivery_date ||
        order?.delivery_target_date ||
        (order as any)?.target_delivery_date ||
        (order as any)?.expected_delivery_date ||
        lead?.delivery_target_date ||
        (lead as any)?.target_delivery_date ||
        (lead as any)?.expected_delivery_date ||
        ''
      );

      eventsToMap.forEach((ev: any, idx: number) => {
        const evTargetedDate = normalizeToYYYYMMDD(
          ev.target_delivery_date ||
          ev.targeted_date ||
          ev.delivery_target_date ||
          ev.target_date ||
          baseTargetedDate
        );

        const evSavedEventDate = normalizeToYYYYMMDD(
          ev.event_date ||
          ev.event_start_date ||
          order?.event_date ||
          lead?.event_date ||
          ''
        );

        const customerName = order?.customer_name || lead?.customer_name || 'Customer';
        const eventName = ev.event_name || ev.event_type || order?.custom_event_name || order?.event_type || lead?.custom_event_name || lead?.event_type || 'Event';
        const location = ev.event_location || order?.event_location || lead?.event_location || 'Studio';

        // 1. Placement on exact saved Event Date
        if (evSavedEventDate) {
          let evTypeCategory = 'event_date';
          let evBadgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
          if (isWaitingApproval) {
            evTypeCategory = 'waiting_approval';
            evBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse';
          } else if (isClientAcceptance) {
            evTypeCategory = 'client_acceptance';
            evBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
          }

          const shouldShowEventDate =
            (evTypeCategory === 'event_date' && activeFilters.eventDates) ||
            (evTypeCategory === 'client_acceptance' && activeFilters.clientAcceptance) ||
            (evTypeCategory === 'waiting_approval' && activeFilters.waitingApproval);

          if (shouldShowEventDate) {
            if (!map[evSavedEventDate]) map[evSavedEventDate] = [];
            map[evSavedEventDate].push({
              id: `event-${orderId}-${ev.id || idx}`,
              type: evTypeCategory,
              badgeColor: evBadgeColor,
              title: `${customerName} - ${eventName}`,
              customerName,
              orderId,
              eventName,
              currentStatus: currentStage,
              eventDate: evSavedEventDate,
              targetDeliveryDate: evTargetedDate || '',
              location,
              rawOrder: order || lead,
              rawProd: prod,
              rawLead: lead
            });
          }
        }

        // 2. Placement on exact Targeted Date (Delivery Date)
        if (evTargetedDate && activeFilters.deliveryDates) {
          if (!map[evTargetedDate]) map[evTargetedDate] = [];
          map[evTargetedDate].push({
            id: `target-delivery-${orderId}-${ev.id || idx}`,
            type: 'delivery_date',
            badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
            title: `Target Delivery: ${customerName} - ${eventName}`,
            customerName,
            orderId,
            eventName: `Target Delivery: ${eventName}`,
            currentStatus: currentStage,
            eventDate: evSavedEventDate || evTargetedDate,
            targetDeliveryDate: evTargetedDate,
            location,
            rawOrder: order || lead,
            rawProd: prod,
            rawLead: lead
          });
        }
      });
    });

    return map;
  }, [orders, leads, production, activeFilters, normalizeToYYYYMMDD]);

  return (
    <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
      
      {/* Calendar Header Navigation & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-3 border-b border-zinc-850">
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 text-white text-xs font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500"
          >
            {monthNames.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 text-white text-xs font-mono rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500"
          >
            {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={todayMonth}
            className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono hover:bg-zinc-850 cursor-pointer transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Calendar Filter Dropdown Container */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                isFilterOpen
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-lg'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850 hover:border-zinc-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5 text-purple-400" />
              <span>Filters</span>
              {isFilterOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-purple-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              )}
            </button>

            {/* Filter Panel Dropdown */}
            {isFilterOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-4 z-50 font-mono text-xs space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                  <span className="font-bold text-zinc-200 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                    <Filter className="w-3 h-3 text-purple-400" />
                    Filter Options
                  </span>
                  {(!draftFilters.eventDates || !draftFilters.deliveryDates || !draftFilters.clientAcceptance || !draftFilters.waitingApproval) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      Modified
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 text-zinc-300 hover:text-white cursor-pointer select-none py-1.5 px-2 rounded-lg hover:bg-zinc-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={draftFilters.eventDates}
                      onChange={(e) => setDraftFilters(prev => ({ ...prev, eventDates: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-500"
                    />
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-xs font-medium">Event Dates</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-zinc-300 hover:text-white cursor-pointer select-none py-1.5 px-2 rounded-lg hover:bg-zinc-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={draftFilters.deliveryDates}
                      onChange={(e) => setDraftFilters(prev => ({ ...prev, deliveryDates: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-indigo-500"
                    />
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-xs font-medium">Delivery Dates</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-zinc-300 hover:text-white cursor-pointer select-none py-1.5 px-2 rounded-lg hover:bg-zinc-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={draftFilters.clientAcceptance}
                      onChange={(e) => setDraftFilters(prev => ({ ...prev, clientAcceptance: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
                    />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-xs font-medium">Client Acceptance</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-zinc-300 hover:text-white cursor-pointer select-none py-1.5 px-2 rounded-lg hover:bg-zinc-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={draftFilters.waitingApproval}
                      onChange={(e) => setDraftFilters(prev => ({ ...prev, waitingApproval: e.target.checked }))}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-amber-500"
                    />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-xs font-medium">Waiting Approval</span>
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-zinc-850">
                  <button
                    onClick={handleResetFilters}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-850 text-xs font-mono cursor-pointer transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleApplyFilters}
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold cursor-pointer transition-colors shadow-sm"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-bold text-zinc-400 uppercase py-1">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      {/* Calendar Days Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {/* Empty Leading Days */}
        {Array.from({ length: firstDayIndex }).map((_, i) => (
          <div key={`empty-${i}`} className="h-[88px] sm:h-[108px] min-h-[88px] sm:min-h-[108px] max-h-[88px] sm:max-h-[108px] p-1 bg-zinc-900/20 rounded-xl border border-zinc-900/50 opacity-30" />
        ))}

        {/* Days of Month */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const monthStr = String(month + 1).padStart(2, '0');
          const dayStr = String(dayNum).padStart(2, '0');
          const fullDateStr = `${year}-${monthStr}-${dayStr}`;

          const isToday = fullDateStr === new Date().toISOString().split('T')[0];
          const dayEvents = eventsByDate[fullDateStr] || [];

          return (
            <div
              key={fullDateStr}
              onClick={() => {
                if (dayEvents.length > 0) {
                  onSelectEvent({ date: fullDateStr, events: dayEvents });
                }
              }}
              className={`h-[88px] sm:h-[108px] min-h-[88px] sm:min-h-[108px] max-h-[88px] sm:max-h-[108px] p-1 sm:p-1.5 rounded-xl border flex flex-col justify-start transition-all overflow-hidden relative ${
                dayEvents.length > 0 ? 'cursor-pointer hover:border-zinc-700' : ''
              } ${
                isToday
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-md'
                  : 'bg-zinc-900/40 border-zinc-850 hover:bg-zinc-900/80'
              }`}
            >
              <div className="w-full flex items-center justify-between shrink-0">
                <span className={`text-xs font-mono font-bold ${isToday ? 'text-amber-400 font-black' : 'text-zinc-400'}`}>
                  {dayNum}
                </span>
                {dayEvents.length > 1 && (
                  <span className="text-[8px] font-mono font-bold px-1 rounded bg-zinc-800 text-zinc-400 hidden sm:inline-block">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* Event Cards inside the Day Cell - Scrollable with max 4 directly visible before scroll */}
              {dayEvents.length > 0 && (
                <div 
                  className="w-full flex-1 flex flex-col justify-start gap-0.5 overflow-y-auto overflow-x-hidden mt-0.5 min-h-0 pr-0.5 text-left"
                  onClick={(e) => {
                    // Allow clicking anywhere in the scrollable container to trigger selection modal as well
                  }}
                >
                  {dayEvents.map((ev, eIdx) => {
                    const displayName = ev.customerName || ev.rawOrder?.customer_name || ev.rawLead?.customer_name || ev.raw?.customer_name || ev.raw?.client_name || 'Client';
                    return (
                      <div
                        key={ev.id || eIdx}
                        className="w-full truncate shrink-0 text-[8px] sm:text-[9.5px] leading-tight px-1 py-0.5 rounded bg-zinc-900/95 text-zinc-300 border border-zinc-800/80 font-medium text-left hover:text-white hover:border-zinc-700 cursor-pointer"
                        title={displayName}
                      >
                        {displayName}
                      </div>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <div className="text-[8px] sm:text-[9px] font-mono text-amber-400/90 px-1 py-0.2 font-bold shrink-0 text-left">
                      +{dayEvents.length - 4} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};

/* ============================================================================
   LEADS REPORT SECTION
   ============================================================================ */
interface LeadsReportSectionProps {
  leads: Lead[];
}

const LeadsReportSection: React.FC<LeadsReportSectionProps> = ({ leads }) => {
  const [leadsStartDate, setLeadsStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  });
  const [leadsEndDate, setLeadsEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedLeadStages, setSelectedLeadStages] = useState<string[]>([]);
  const [selectedLeadEventType, setSelectedLeadEventType] = useState<string>('all');
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [showStageFilterDropdown, setShowStageFilterDropdown] = useState(false);

  const allLeadStages = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => {
      const st = l.status || l.current_status || 'New';
      if (st) s.add(st);
    });
    return Array.from(s);
  }, [leads]);

  useEffect(() => {
    if (allLeadStages.length > 0 && selectedLeadStages.length === 0) {
      setSelectedLeadStages(allLeadStages);
    }
  }, [allLeadStages]);

  const allLeadEventTypes = useMemo(() => {
    const et = new Set<string>();
    leads.forEach(l => {
      if (l.event_type) et.add(l.event_type);
    });
    return Array.from(et);
  }, [leads]);

  const filteredLeadsReport = useMemo(() => {
    return leads.filter(l => {
      const dateVal = (l.created_date || l.created_at || '').split('T')[0];
      if (leadsStartDate && leadsEndDate && dateVal) {
        if (dateVal < leadsStartDate || dateVal > leadsEndDate) return false;
      }

      const stage = l.status || l.current_status || 'New';
      if (selectedLeadStages.length > 0 && !selectedLeadStages.includes(stage)) {
        return false;
      }

      if (selectedLeadEventType !== 'all' && l.event_type !== selectedLeadEventType) {
        return false;
      }

      if (leadSearchTerm) {
        const term = leadSearchTerm.toLowerCase();
        const nameMatch = (l.customer_name || '').toLowerCase().includes(term);
        const mobileMatch = (l.mobile || '').toLowerCase().includes(term);
        const idMatch = (l.lead_id || '').toLowerCase().includes(term);
        if (!nameMatch && !mobileMatch && !idMatch) return false;
      }

      return true;
    }).sort((a, b) => compareRecordsByDate(a, b, 'latest'));
  }, [leads, leadsStartDate, leadsEndDate, selectedLeadStages, selectedLeadEventType, leadSearchTerm]);

  const handleDownloadLeadsReport = () => {
    const excelData = filteredLeadsReport.map(l => ({
      'Lead ID': l.lead_id || '-',
      'Customer Name': l.customer_name || '-',
      'Mobile': l.mobile || '-',
      'Email': l.email || '-',
      'WhatsApp': l.whatsapp_number || '-',
      'Lead Stage': l.status || l.current_status || 'New',
      'Event Type': l.event_type || '-',
      'Event Date': l.event_date || '-',
      'Event Location': l.event_location || '-',
      'Salesperson': l.sales_person || l.sales_staff_name || '-',
      'Created Date': (l.created_date || l.created_at || '').split('T')[0] || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads Report');
    XLSX.writeFile(workbook, `Leads_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header & Controls Bar */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white tracking-wide flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              <span>Comprehensive Leads Report</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Analyze and export all system leads filtered by date range, stages, and event types.
            </p>
          </div>

          <button
            onClick={handleDownloadLeadsReport}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Filtered Report ({filteredLeadsReport.length})</span>
          </button>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-zinc-800">
          
          {/* Date From */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">From Date</label>
            <DateFilterInput
              value={leadsStartDate}
              onChange={setLeadsStartDate}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">To Date</label>
            <DateFilterInput
              value={leadsEndDate}
              onChange={setLeadsEndDate}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Event Type Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">Event Type</label>
            <select
              value={selectedLeadEventType}
              onChange={(e) => setSelectedLeadEventType(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">All Event Types ({allLeadEventTypes.length})</option>
              {allLeadEventTypes.map(et => (
                <option key={et} value={et}>{et}</option>
              ))}
            </select>
          </div>

          {/* Stage Filter Multi-Select Dropdown */}
          <div className="space-y-1 relative">
            <label className="text-[10px] font-mono font-bold uppercase text-zinc-400">Lead Stages ({selectedLeadStages.length} / {allLeadStages.length})</label>
            <button
              type="button"
              onClick={() => setShowStageFilterDropdown(!showStageFilterDropdown)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 flex items-center justify-between hover:border-cyan-500 transition-colors cursor-pointer text-left"
            >
              <span className="truncate">
                {selectedLeadStages.length === allLeadStages.length
                  ? 'All Stages Selected'
                  : selectedLeadStages.length === 0
                  ? 'No Stages Selected'
                  : `${selectedLeadStages.length} Stages Selected`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 ml-1" />
            </button>

            {showStageFilterDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 shadow-2xl z-50 space-y-2 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setSelectedLeadStages(allLeadStages)}
                    className="text-cyan-400 hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLeadStages([])}
                    className="text-zinc-400 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                {allLeadStages.map(stage => {
                  const isChecked = selectedLeadStages.includes(stage);
                  return (
                    <label key={stage} className="flex items-center gap-2 text-xs text-zinc-300 hover:text-white cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLeadStages([...selectedLeadStages, stage]);
                          } else {
                            setSelectedLeadStages(selectedLeadStages.filter(s => s !== stage));
                          }
                        }}
                        className="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-0 cursor-pointer"
                      />
                      <span className="truncate">{stage}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Search Bar & Quick Count */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="w-full sm:w-72">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by name, mobile, lead ID..."
                value={leadSearchTerm}
                onChange={(e) => setLeadSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div className="text-xs font-mono text-zinc-400">
            Showing <span className="text-cyan-400 font-bold">{filteredLeadsReport.length}</span> of <span className="text-white font-bold">{leads.length}</span> total leads
          </div>
        </div>

      </div>

      {/* Leads Table Card */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-950/80 border-b border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Lead ID / Date</th>
                <th className="py-3 px-4 font-bold">Customer Name</th>
                <th className="py-3 px-4 font-bold">Contact Details</th>
                <th className="py-3 px-4 font-bold">Lead Stage</th>
                <th className="py-3 px-4 font-bold">Event Type</th>
                <th className="py-3 px-4 font-bold">Event Date</th>
                <th className="py-3 px-4 font-bold">Assigned Sales / Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredLeadsReport.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-mono text-xs">
                    No leads found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredLeadsReport.map((l) => {
                  const createdDateStr = (l.created_date || l.created_at || '').split('T')[0];
                  const stage = l.status || l.current_status || 'New';
                  return (
                    <tr key={l.lead_id} className="hover:bg-zinc-850/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-zinc-200">{l.lead_id}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{createdDateStr || 'N/A'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{l.customer_name || 'Unnamed'}</div>
                        {l.email && <div className="text-[11px] text-zinc-400">{l.email}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-zinc-200 font-mono">{l.mobile || '-'}</div>
                        {l.whatsapp_number && <div className="text-[10px] text-zinc-400 font-mono">WA: {l.whatsapp_number}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          stage === 'Booked' || stage === 'Order Closed' || stage === 'Project Completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : stage === 'Lost' || stage === 'Cancelled'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        }`}>
                          {stage}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-zinc-200 font-medium">{l.event_type || 'General'}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-zinc-200 font-mono">{l.event_date ? formatDateDDMMYY(l.event_date) : 'TBD'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-zinc-200">{l.sales_person || l.sales_staff_name || 'Unassigned'}</div>
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
  );
};

/* ============================================================================
   REVENUE & PAYMENT SUMMARY SECTION 4
   ============================================================================ */
interface RevenuePaymentSummarySectionProps {
  orders: Order[];
  payments: Payment[];
  leads: Lead[];
  production: Production[];
}

// Helper to normalize any event date format to standard YYYY-MM-DD without timezone shifts
const normalizeEventDateToYYYYMMDD = (dateVal: any): string | null => {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const rawStr = String(dateVal).trim();
  if (!rawStr || rawStr === 'undefined' || rawStr === 'null' || rawStr === '—' || rawStr === '-' || rawStr === 'N/A' || rawStr === 'TBD') {
    return null;
  }

  // 1. ISO string with T (e.g. "2026-09-22T00:00:00.000Z")
  if (rawStr.includes('T')) {
    const isoPart = rawStr.split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) {
      return isoPart;
    }
  }

  // 2. Format like "22 Sep 2026" or "22-Sep-2026" or "22 September 2026"
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };
  const dMmmYMatch = rawStr.match(/^(\d{1,2})[\/\-\.\s]+([a-zA-Z]{3,9})[\/\-\.\s]+(\d{2,4})/);
  if (dMmmYMatch) {
    const day = dMmmYMatch[1].padStart(2, '0');
    const mKey = dMmmYMatch[2].toLowerCase();
    const month = MONTHS[mKey] || MONTHS[mKey.slice(0, 3)] || '01';
    let year = dMmmYMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // 3. Format like "2026-09-22" or "2026/09/22" or "2026.09.22"
  const ymdMatch = rawStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 4. Format like "22/09/2026" or "22-09-2026" or "22.09.2026"
  const dmyMatch = rawStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback to Date object parsing
  try {
    const d = new Date(rawStr);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (_) {}

  return null;
};

const isDateInRange = (dateStr: string | null, start: string | null, end: string | null): boolean => {
  if (!dateStr) return false;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
};

const getPeriodDates = (period: 'this_month' | 'last_month' | 'last_3_months') => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let startYear = year;
  let startMonth = month;
  let endYear = year;
  let endMonth = month;

  if (period === 'this_month') {
    startYear = year;
    startMonth = month;
    endYear = year;
    endMonth = month;
  } else if (period === 'last_month') {
    startMonth = month - 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear = year - 1;
    }
    endYear = startYear;
    endMonth = startMonth;
  } else if (period === 'last_3_months') {
    startMonth = month - 2;
    startYear = year;
    if (startMonth < 0) {
      startMonth += 12;
      startYear = year - 1;
    }
    endYear = year;
    endMonth = month;
  }

  const startDateObj = new Date(startYear, startMonth, 1);
  const endDateObj = new Date(endYear, endMonth + 1, 0);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    startDate: formatDate(startDateObj),
    endDate: formatDate(endDateObj)
  };
};

const getPeriodLabel = (period: string) => {
  const now = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (period === 'this_month') {
    return `THIS MONTH — ${monthNames[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;
  } else if (period === 'last_month') {
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `LAST MONTH — ${monthNames[prevMonth.getMonth()].toUpperCase()} ${prevMonth.getFullYear()}`;
  } else if (period === 'last_3_months') {
    const m2 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const m1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `LAST 3 MONTHS — ${monthNames[m2.getMonth()].toUpperCase()} + ${monthNames[m1.getMonth()].toUpperCase()} + ${monthNames[now.getMonth()].toUpperCase()} ${now.getFullYear()}`;
  }
  return 'SELECTED PERIOD';
};

const RevenuePaymentSummarySection: React.FC<RevenuePaymentSummarySectionProps> = ({
  orders,
  payments,
  leads,
  production
}) => {
  const { paymentHistory } = useRole();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<'this_month' | 'last_month' | 'last_3_months'>('this_month');
  const [startDate, setStartDate] = useState(() => getPeriodDates('this_month').startDate);
  const [endDate, setEndDate] = useState(() => getPeriodDates('this_month').endDate);

  useEffect(() => {
    const { startDate: s, endDate: e } = getPeriodDates(selectedPeriod);
    setStartDate(s);
    setEndDate(e);
  }, [selectedPeriod]);

  // Clickable summary card state
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedPaymentHistoryOrder, setSelectedPaymentHistoryOrder] = useState<any | null>(null);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any | null>(null);
  const [noteModalOrder, setNoteModalOrder] = useState<any | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [paymentTab, setPaymentTab] = useState<'all' | 'pending' | 'history'>('all');

  // Combined detailed records
  const records = useMemo(() => {
    const coveredOrderIds = new Set<string>();
    orders.forEach(o => {
      getAllMatchingOrderIds(o.order_id, o.lead_id, orders, leads).forEach(id => coveredOrderIds.add(id));
    });

    // Find any leads or payments with payment history that are not yet in orders table
    const standalonePendingOrders: any[] = [];
    (paymentHistory || []).forEach(h => {
      const hid = String(h.order_id || '').trim();
      if (!hid || coveredOrderIds.has(hid)) return;

      const matchingLead = leads.find(l => {
        const leadIds = getAllMatchingOrderIds(null, l.lead_id, orders, leads);
        return leadIds.includes(hid);
      });
      const isAlreadyAdded = standalonePendingOrders.some(s => {
        const sIds = getAllMatchingOrderIds(s.order_id, s.lead_id, orders, leads);
        return sIds.includes(hid);
      });
      if (!isAlreadyAdded) {
        standalonePendingOrders.push({
          order_id: (matchingLead as any)?.order_id || hid,
          lead_id: matchingLead?.lead_id || hid,
          customer_name: matchingLead?.customer_name || 'Customer',
          event_type: matchingLead?.event_type || 'Event Photography',
          event_date: matchingLead?.event_date || (h.payment_date ? h.payment_date.split('T')[0] : ''),
          quotation_amount: Number(matchingLead?.Final_Quotation_Amount) || Number(matchingLead?.budget) || Number(h.amount) || 0,
          current_stage: 'Confirmed',
          order_status: 'Confirmed',
          created_at: h.created_at || new Date().toISOString()
        });
      }
    });

    // Also check payments table for any pending payments without order records
    (payments || []).forEach(p => {
      const pid = String(p.order_id || '').trim();
      if (!pid || coveredOrderIds.has(pid)) return;
      const isAlreadyAdded = standalonePendingOrders.some(s => {
        const sIds = getAllMatchingOrderIds(s.order_id, s.lead_id, orders, leads);
        return sIds.includes(pid);
      });
      if (!isAlreadyAdded) {
        const matchingLead = leads.find(l => {
          const leadIds = getAllMatchingOrderIds(null, l.lead_id, orders, leads);
          return leadIds.includes(pid);
        });
        standalonePendingOrders.push({
          order_id: (matchingLead as any)?.order_id || pid,
          lead_id: matchingLead?.lead_id || pid,
          customer_name: matchingLead?.customer_name || 'Customer',
          event_type: matchingLead?.event_type || 'Event Photography',
          event_date: matchingLead?.event_date || (p.payment_date ? p.payment_date.split('T')[0] : ''),
          quotation_amount: Number(matchingLead?.Final_Quotation_Amount) || Number(matchingLead?.budget) || Number(p.quotation_amount) || 0,
          current_stage: 'Confirmed',
          order_status: 'Confirmed',
          created_at: (p as any).created_at || new Date().toISOString()
        });
      }
    });

    const allOrderSource = [...orders, ...standalonePendingOrders];

    return allOrderSource.map(o => {
      const matchingIdsList = getAllMatchingOrderIds(o.order_id, o.lead_id, orders, leads);
      const matchingIds = new Set(matchingIdsList);

      const pay = payments.find(p => matchingIds.has(p.order_id) || (p.lead_id && matchingIds.has(p.lead_id)));
      const prod = production.find(p => p.tracking_id === o.lead_id || p.order_id === o.lead_id || p.tracking_id === o.order_id);
      const ld = leads.find(l => matchingIds.has(l.lead_id) || (l as any).order_id === o.order_id);

      // Extract all real event records for this order/lead
      const rawLeadEvents = ld?.events && Array.isArray(ld.events) && ld.events.length > 0
        ? ld.events
        : (o?.events && Array.isArray((o as any).events) && (o as any).events.length > 0 ? (o as any).events : []);
      const deserialized = (!rawLeadEvents || rawLeadEvents.length === 0) && (ld?.notes_special_customizations || o?.notes_special_customizations)
        ? deserializeLeadEvents(ld?.notes_special_customizations || o?.notes_special_customizations).events
        : [];
      const extractedEvents = rawLeadEvents.length > 0 ? rawLeadEvents : (deserialized.length > 0 ? deserialized : []);

      const events = extractedEvents.length > 0
        ? extractedEvents
        : [{
            event_name: o.custom_event_name || o.event_type || ld?.custom_event_name || ld?.event_type || 'Event Photography',
            event_date: o.event_date || ld?.event_date || (o as any).Reporting_date || (ld as any).Reporting_date || '',
            event_start_time: (o as any).event_start_time || o.event_time || ld?.event_time || (o as any).reporting_time || ld?.reporting_time || ''
          }];

      const primaryEventDate = events[0]?.event_date || o.event_date || ld?.event_date || '';
      const primaryEventName = events[0]?.event_name || events[0]?.event_type || o.custom_event_name || o.event_type || 'Event Photography';

      let rejectedIds = new Set<string>();
      try {
        const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
        if (rejectedSaved) rejectedIds = new Set(JSON.parse(rejectedSaved));
      } catch (_) {}

      let approvedIds = new Set<string>();
      try {
        const approvedSaved = localStorage.getItem('approved_payment_history_ids');
        if (approvedSaved) approvedIds = new Set(JSON.parse(approvedSaved));
      } catch (_) {}

      const approvedHistories = (paymentHistory || []).filter(h => {
        const hOrderId = String(h.order_id || '').trim();
        if (!matchingIds.has(hOrderId)) return false;
        const histId = String(h.id || h.payment_history_id || '');
        if (rejectedIds.has(histId)) return false;
        const isExplicitlyRejected = h.approval_status === 'Rejected' || 
          (typeof h.notes === 'string' && (
            h.notes.includes('Rejected') || 
            h.notes.includes('[REJECTED]') || 
            h.notes.endsWith('- Rejected') || 
            h.notes.toLowerCase().includes('rejected by business owner')
          ));
        if (isExplicitlyRejected) return false;

        return (
          h.approval_status === 'Approved' ||
          approvedIds.has(histId) ||
          (!h.notes || (!h.notes.includes('Waiting for Approval') && !h.notes.includes('Rejected')))
        );
      });
      const historyApprovedSum = approvedHistories.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

      // Check localStorage pending approvals as well for instantaneous multi-tab sync
      let localPendingList: any[] = [];
      try {
        const localSaved = localStorage.getItem('pending_payment_approvals');
        if (localSaved) localPendingList = JSON.parse(localSaved) || [];
      } catch (_) {}

      const hasPendingInHistory = (paymentHistory || []).some(h => {
        const hOrderId = String(h.order_id || '').trim();
        if (!matchingIds.has(hOrderId)) return false;
        const histId = String(h.id || h.payment_history_id || '');
        if (rejectedIds.has(histId)) return false;
        const isExplicitlyRejected = h.approval_status === 'Rejected' || 
          (typeof h.notes === 'string' && (
            h.notes.includes('Rejected') || 
            h.notes.includes('[REJECTED]') || 
            h.notes.endsWith('- Rejected') || 
            h.notes.toLowerCase().includes('rejected by business owner')
          ));
        if (isExplicitlyRejected) return false;

        return (
          h.approval_status === 'Waiting for Approval' ||
          (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval'))
        );
      });

      const hasPendingInLocal = localPendingList.some((h: any) => {
        const hOrderId = String(h.order_id || '').trim();
        if (!matchingIds.has(hOrderId)) return false;
        const histId = String(h.id || h.payment_history_id || '');
        if (rejectedIds.has(histId)) return false;
        return (
          h.approval_status === 'Waiting for Approval' ||
          (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval'))
        );
      });

      const hasPendingApproval = hasPendingInHistory || hasPendingInLocal || (pay?.payment_status === 'Waiting for Approval');

      const totalRevenue = Number(ld?.Final_Quotation_Amount) || Number((ld as any)?.final_quotation_amount) || Number(o.quotation_amount) || Number(ld?.final_amount) || Number(ld?.budget) || Number(o.advance_received) || 0;
      const paymentReceived = approvedHistories.length > 0
        ? historyApprovedSum
        : (pay && pay.payment_status !== 'Waiting for Approval' ? ((pay.advance_received || 0) + (pay.final_payment_received || 0)) : Number(o.advance_received || 0));
      const outstanding = Math.max(0, totalRevenue - paymentReceived);

      const isCompleted = ['Event Completed', 'Client Acceptance', 'Delivered', 'Project Delivered', 'Completed'].includes(o.current_stage) || prod?.editing_status === 'Client Acceptance';
      const isClosed = o.current_stage === 'Order Closed' || o.current_stage === 'Closed' || prod?.editing_status === 'Order Closed';

      const paymentDate = pay?.payment_date || '-';
      const paymentType = pay?.payment_type || pay?.Payment_type || (pay?.final_payment_received ? 'Final Payment' : pay?.advance_received ? 'Advance Payment' : 'Event Date Payment');
      const transactionId = pay?.transaction_id || '-';

      const paymentStatus = hasPendingApproval ? 'Waiting for Approval' : (pay ? pay.payment_status : (outstanding <= 0 && totalRevenue > 0 ? 'Fully Paid' : (paymentReceived > 0 ? 'Partially Paid' : 'Pending')));

      return {
        orderId: o.order_id,
        leadId: o.lead_id,
        customerName: o.customer_name,
        eventName: primaryEventName,
        eventDate: primaryEventDate,
        events,
        paymentDate,
        paymentType,
        transactionId,
        totalRevenue,
        paymentReceived,
        outstanding,
        paymentStatus,
        hasPendingApproval,
        currentStage: isClosed ? 'Order Closed' : (prod?.editing_status || o.current_stage || 'Confirmed'),
        isCompleted,
        isClosed,
        created_at: o.created_at || ld?.created_at || (pay as any)?.created_at,
        updated_at: o.updated_at || ld?.updated_at || (pay as any)?.updated_at,
        order: o,
        lead: ld,
        payment: pay
      };
    });
  }, [orders, payments, production, paymentHistory, leads]);

  // Base filtered by Search & Event Date & Payment Tab (used for KPI card totals)
  const baseFiltered = useMemo(() => {
    const startNorm = normalizeEventDateToYYYYMMDD(startDate);
    const endNorm = normalizeEventDateToYYYYMMDD(endDate);

    const matched = records.map(r => {
      // 1. Search text match
      const matchSearch = 
        !searchTerm.trim() ||
        r.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.events && r.events.some((ev: any) => (ev.event_name || ev.event_type || '').toLowerCase().includes(searchTerm.toLowerCase())));

      // 2. Strict Event Date Only filter
      let matchDate = true;
      let matchingEvents: any[] = r.events || [];

      if (startNorm || endNorm) {
        matchingEvents = (r.events || []).filter((ev: any) => {
          const evDate = ev.event_date || ev.event_start_date || ev.reporting_date;
          const normalized = normalizeEventDateToYYYYMMDD(evDate);
          return isDateInRange(normalized, startNorm, endNorm);
        });

        // If events array had no dates, fallback to top-level eventDate
        if (matchingEvents.length === 0 && (!r.events || r.events.length === 0 || !r.events[0]?.event_date)) {
          const topLevelDateNorm = normalizeEventDateToYYYYMMDD(r.eventDate);
          const topLevelMatch = isDateInRange(topLevelDateNorm, startNorm, endNorm);
          if (topLevelMatch) {
            matchingEvents = r.events || [];
            matchDate = true;
          } else {
            matchDate = false;
          }
        } else {
          matchDate = matchingEvents.length > 0;
        }

        // CRITICAL: Any record with payments waiting for approval MUST ALWAYS be visible for Business Owner approval
        // and must NOT be excluded by date range filters!
        if (r.hasPendingApproval) {
          matchDate = true;
          if (matchingEvents.length === 0) {
            matchingEvents = r.events || [];
          }
        }
      }

      // 3. Tab filter
      let matchTab = true;
      if (paymentTab === 'pending') {
        matchTab = r.outstanding > 0 || r.paymentStatus === 'Pending' || r.paymentStatus === 'Partially Paid' || r.hasPendingApproval;
      } else if (paymentTab === 'history') {
        matchTab = r.paymentReceived > 0 || r.paymentStatus === 'Fully Paid';
      }

      if (!matchSearch || !matchDate || !matchTab) {
        return null;
      }

      return {
        ...r,
        matchingEvents
      };
    }).filter(Boolean) as (typeof records[0] & { matchingEvents: any[] })[];

    return matched.sort((a, b) => {
      const timeA = getOrderCreationOrUpdateTimestamp(a);
      const timeB = getOrderCreationOrUpdateTimestamp(b);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return compareAlphanumeric(b.orderId, a.orderId);
    });
  }, [records, searchTerm, startDate, endDate, paymentTab]);

  // Totals for summary header
  const totalRevSum = useMemo(() => baseFiltered.reduce((s, r) => s + r.totalRevenue, 0), [baseFiltered]);
  const totalRecSum = useMemo(() => baseFiltered.reduce((s, r) => s + r.paymentReceived, 0), [baseFiltered]);
  const totalOutSum = useMemo(() => baseFiltered.reduce((s, r) => s + r.outstanding, 0), [baseFiltered]);
  const completedCount = useMemo(() => baseFiltered.filter(r => r.isCompleted || r.isClosed).length, [baseFiltered]);
  const closedCount = useMemo(() => baseFiltered.filter(r => r.isClosed).length, [baseFiltered]);

  // Filtered by selected analytics card for Revenue table and reports
  const filtered = useMemo(() => {
    if (!selectedCard) return baseFiltered;
    if (selectedCard === 'summary_revenue') {
      return baseFiltered;
    }
    if (selectedCard === 'summary_payment') {
      return baseFiltered.filter(r => r.paymentReceived > 0 || r.hasPendingApproval);
    }
    if (selectedCard === 'summary_outstanding') {
      return baseFiltered.filter(r => r.outstanding > 0 || r.hasPendingApproval);
    }
    if (selectedCard === 'summary_completed') {
      return baseFiltered.filter(r => r.isCompleted || r.isClosed);
    }
    if (selectedCard === 'summary_closed') {
      return baseFiltered.filter(r => r.isClosed);
    }
    return baseFiltered;
  }, [baseFiltered, selectedCard]);

  // Configs for Summary Card details
  const modalData = useMemo(() => {
    if (!selectedCard) return [];
    if (selectedCard === 'summary_revenue') {
      return baseFiltered;
    }
    if (selectedCard === 'summary_payment') {
      return baseFiltered.filter(r => r.paymentReceived > 0);
    }
    if (selectedCard === 'summary_outstanding') {
      return baseFiltered.filter(r => r.outstanding > 0);
    }
    if (selectedCard === 'summary_completed') {
      return baseFiltered.filter(r => r.isCompleted || r.isClosed);
    }
    if (selectedCard === 'summary_closed') {
      return baseFiltered.filter(r => r.isClosed);
    }
    return [];
  }, [selectedCard, baseFiltered]);

  const modalColumns = useMemo(() => {
    const actionCol = { 
      key: 'actions', 
      label: 'Action', 
      render: (item: any) => (
        <button
          type="button"
          onClick={() => {
            const fullOrder = orders.find(o => o.order_id === item.orderId || o.lead_id === item.leadId) || item;
            setSelectedPaymentHistoryOrder(fullOrder);
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
          title="View Payment History"
        >
          <History className="w-3.5 h-3.5" />
          <span>Payment History</span>
        </button>
      )
    };

    const baseCols = [
      { key: 'orderId', label: 'Order ID', render: (item: any) => <span className="font-mono font-bold text-amber-400">{item.orderId}</span> },
      { key: 'customerName', label: 'Customer Name', render: (item: any) => <span className="font-bold text-white">{item.customerName}</span> },
      { key: 'eventName', label: 'Event Name', render: (item: any) => <span>{item.eventName}</span> },
      { key: 'assignedStaff', label: 'Assigned Staff', render: (item: any) => <AssignedStaffDropdown orderId={item.orderId} leadId={item.leadId} /> },
      { key: 'eventDate', label: 'Event Date', render: (item: any) => <span className="font-mono text-zinc-400">{item.eventDate ? formatDateDDMMYY(item.eventDate) : 'N/A'}</span> }
    ];

    if (selectedCard === 'summary_revenue') {
      return [
        ...baseCols,
        { key: 'totalRevenue', label: 'Total Revenue', render: (item: any) => <span className="font-mono text-emerald-400 font-bold">{formatINR(item.totalRevenue)}</span> },
        { key: 'paymentReceived', label: 'Received', render: (item: any) => <span className="font-mono text-zinc-300">{formatINR(item.paymentReceived)}</span> },
        { key: 'outstanding', label: 'Outstanding', render: (item: any) => <span className="font-mono text-rose-400">{formatINR(item.outstanding)}</span> },
        { key: 'paymentStatus', label: 'Payment Status', render: (item: any) => (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            item.paymentStatus === 'Fully Paid'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : item.paymentStatus === 'Partially Paid'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {item.paymentStatus}
          </span>
        )},
        actionCol
      ];
    }
    if (selectedCard === 'summary_payment') {
      return [
        { key: 'orderId', label: 'Order ID', render: (item: any) => <span className="font-mono font-bold text-amber-400">{item.orderId}</span> },
        { key: 'customerName', label: 'Customer Name', render: (item: any) => <span className="font-bold text-white">{item.customerName}</span> },
        { key: 'eventName', label: 'Event Name', render: (item: any) => <span>{item.eventName}</span> },
        { key: 'assignedStaff', label: 'Assigned Staff', render: (item: any) => <AssignedStaffDropdown orderId={item.orderId} leadId={item.leadId} /> },
        { key: 'paymentDate', label: 'Payment Date', render: (item: any) => <span className="font-mono text-zinc-300">{item.paymentDate ? item.paymentDate.split('T')[0] : 'N/A'}</span> },
        { key: 'paymentType', label: 'Payment Type', render: (item: any) => <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-mono">{item.paymentType || 'Standard'}</span> },
        { key: 'paymentReceived', label: 'Payment Received', render: (item: any) => <span className="font-mono text-emerald-400 font-bold">{formatINR(item.paymentReceived)}</span> },
        { key: 'transactionId', label: 'Transaction / Ref', render: (item: any) => <span className="font-mono text-zinc-400 text-[10px]">{item.transactionId || '-'}</span> },
        { key: 'paymentStatus', label: 'Payment Status', render: (item: any) => (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            item.paymentStatus === 'Fully Paid'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : item.paymentStatus === 'Partially Paid'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {item.paymentStatus}
          </span>
        )},
        actionCol
      ];
    }
    if (selectedCard === 'summary_outstanding') {
      return [
        ...baseCols,
        { key: 'totalRevenue', label: 'Total Revenue', render: (item: any) => <span className="font-mono text-zinc-400">{formatINR(item.totalRevenue)}</span> },
        { key: 'paymentReceived', label: 'Received', render: (item: any) => <span className="font-mono text-emerald-400">{formatINR(item.paymentReceived)}</span> },
        { key: 'outstanding', label: 'Outstanding Balance', render: (item: any) => <span className="font-mono text-rose-400 font-bold">{formatINR(item.outstanding)}</span> },
        { key: 'paymentStatus', label: 'Payment Status', render: (item: any) => (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            item.paymentStatus === 'Fully Paid'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : item.paymentStatus === 'Partially Paid'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {item.paymentStatus}
          </span>
        )},
        actionCol
      ];
    }
    if (selectedCard === 'summary_completed' || selectedCard === 'summary_closed') {
      return [
        ...baseCols,
        { key: 'totalRevenue', label: 'Total Revenue', render: (item: any) => <span className="font-mono text-emerald-400">{formatINR(item.totalRevenue)}</span> },
        { key: 'paymentReceived', label: 'Received', render: (item: any) => <span className="font-mono text-zinc-300">{formatINR(item.paymentReceived)}</span> },
        { key: 'currentStage', label: 'Current Stage', render: (item: any) => <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-850 font-bold font-mono text-[10px] text-zinc-300">{item.currentStage || 'Completed'}</span> },
        actionCol
      ];
    }
    return [];
  }, [selectedCard, orders]);

  const modalTitleAndMeta = useMemo(() => {
    switch (selectedCard) {
      case 'summary_revenue':
        return {
          title: 'Summary: Total Revenue',
          totalLabel: 'Total Revenue Sum',
          totalValue: formatINR(totalRevSum),
          accentColor: 'blue' as const,
          filterDescription: 'This list displays all summary orders active within the selected parameters, contributing to the Total Revenue.'
        };
      case 'summary_payment':
        return {
          title: 'Summary: Payment Received & Collections',
          totalLabel: 'Total Received Sum',
          totalValue: formatINR(totalRecSum),
          accentColor: 'emerald' as const,
          filterDescription: 'This list displays all payments received, transaction collections, and deposits for active orders.'
        };
      case 'summary_outstanding':
        return {
          title: 'Summary: Outstanding Balances',
          totalLabel: 'Total Outstanding Balance',
          totalValue: formatINR(totalOutSum),
          accentColor: 'rose' as const,
          filterDescription: 'This list displays all summary orders that currently have a positive outstanding balance.'
        };
      case 'summary_completed':
        return {
          title: 'Summary: Completed Orders',
          totalLabel: 'Completed Projects Count',
          totalValue: `${completedCount} Projects`,
          accentColor: 'amber' as const,
          filterDescription: 'This list displays all projects that have been successfully completed, delivered, or accepted by clients.'
        };
      case 'summary_closed':
        return {
          title: 'Summary: Closed Orders',
          totalLabel: 'Closed Projects Count',
          totalValue: `${closedCount} Projects`,
          accentColor: 'blue' as const,
          filterDescription: 'This list displays all projects that have been fully closed and archived.'
        };
      default:
        return {
          title: 'Detail View',
          totalLabel: 'Total',
          totalValue: '0',
          accentColor: 'amber' as const,
          filterDescription: ''
        };
    }
  }, [selectedCard, totalRevSum, totalRecSum, totalOutSum, completedCount, closedCount]);

  // Export CSV
  const downloadCSV = () => {
    const dataToExport = filtered;
    if (dataToExport.length === 0) {
      alert("No data available to export.");
      return;
    }

    const cardTitle = selectedCard === 'summary_revenue' ? 'Total_Revenue'
      : selectedCard === 'summary_payment' ? 'Payment_Received'
      : selectedCard === 'summary_outstanding' ? 'Outstanding'
      : selectedCard === 'summary_completed' ? 'Completed'
      : selectedCard === 'summary_closed' ? 'Closed_Orders'
      : 'Revenue_Summary';

    const headers = ['Order ID', 'Customer Name', 'Event Name', 'Event Date', 'Total Revenue (INR)', 'Payment Received (INR)', 'Outstanding (INR)', 'Payment Status', 'Current Status'];
    const rows = dataToExport.map(r => {
      const displayEvName = (r.matchingEvents && r.matchingEvents.length > 0)
        ? r.matchingEvents.map(e => e.event_name || e.event_type || 'Event').join(' | ')
        : (r.eventName || '');
      const displayEvDate = (r.matchingEvents && r.matchingEvents.length > 0)
        ? r.matchingEvents.map(e => formatDateDDMMYY(e.event_date || e.event_start_date)).join(' | ')
        : (r.eventDate ? formatDateDDMMYY(r.eventDate) : '');

      return [
        `"${String(r.orderId || '').replace(/"/g, '""')}"`,
        `"${String(r.customerName || '').replace(/"/g, '""')}"`,
        `"${String(displayEvName).replace(/"/g, '""')}"`,
        `"${String(displayEvDate).replace(/"/g, '""')}"`,
        r.totalRevenue || 0,
        r.paymentReceived || 0,
        r.outstanding || 0,
        `"${String(r.paymentStatus || '').replace(/"/g, '""')}"`,
        `"${String(r.currentStage || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${cardTitle}_Report_${startDate || 'all'}_to_${endDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Excel (.xlsx)
  const downloadExcel = () => {
    const dataToExport = filtered;
    if (dataToExport.length === 0) {
      alert("No data available to export.");
      return;
    }
    const cardTitle = selectedCard === 'summary_revenue' ? 'Total_Revenue'
      : selectedCard === 'summary_payment' ? 'Payment_Received'
      : selectedCard === 'summary_outstanding' ? 'Outstanding'
      : selectedCard === 'summary_completed' ? 'Completed'
      : selectedCard === 'summary_closed' ? 'Closed_Orders'
      : 'Revenue_Summary';

    const excelData = dataToExport.map(r => {
      const displayEvName = (r.matchingEvents && r.matchingEvents.length > 0)
        ? r.matchingEvents.map(e => e.event_name || e.event_type || 'Event').join(' | ')
        : (r.eventName || '');
      const displayEvDate = (r.matchingEvents && r.matchingEvents.length > 0)
        ? r.matchingEvents.map(e => formatDateDDMMYY(e.event_date || e.event_start_date)).join(' | ')
        : (r.eventDate ? formatDateDDMMYY(r.eventDate) : '');

      return {
        'Order ID': r.orderId || '',
        'Customer Name': r.customerName || '',
        'Event Name': displayEvName,
        'Event Date': displayEvDate,
        'Total Revenue (₹)': r.totalRevenue || 0,
        'Payment Received (₹)': r.paymentReceived || 0,
        'Outstanding Balance (₹)': r.outstanding || 0,
        'Payment Status': r.paymentStatus || '',
        'Current Status': r.currentStage || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, `${cardTitle}_Report_${startDate || 'all'}_to_${endDate || 'all'}.xlsx`);
  };

  // Export PDF
  const downloadPDF = () => {
    const dataToExport = filtered;
    if (dataToExport.length === 0) {
      alert("No data available to export.");
      return;
    }
    const cardLabel = selectedCard === 'summary_revenue' ? 'Total Revenue'
      : selectedCard === 'summary_payment' ? 'Payment Received'
      : selectedCard === 'summary_outstanding' ? 'Outstanding'
      : selectedCard === 'summary_completed' ? 'Completed'
      : selectedCard === 'summary_closed' ? 'Closed Orders'
      : 'Revenue & Payment Summary';

    const cardTitle = selectedCard === 'summary_revenue' ? 'Total_Revenue'
      : selectedCard === 'summary_payment' ? 'Payment_Received'
      : selectedCard === 'summary_outstanding' ? 'Outstanding'
      : selectedCard === 'summary_completed' ? 'Completed'
      : selectedCard === 'summary_closed' ? 'Closed_Orders'
      : 'Revenue_Summary';

    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.text(`${cardLabel} Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${formatDateDDMMYY(new Date())} | Date Range: ${startDate ? formatDateDDMMYY(startDate) : 'All'} to ${endDate ? formatDateDDMMYY(endDate) : 'All'} | Total Records: ${dataToExport.length}`, 14, 22);

    const subTotalRev = dataToExport.reduce((s, r) => s + (r.totalRevenue || 0), 0);
    const subTotalRec = dataToExport.reduce((s, r) => s + (r.paymentReceived || 0), 0);
    const subTotalOut = dataToExport.reduce((s, r) => s + (r.outstanding || 0), 0);

    doc.setFontSize(11);
    doc.text(`Total Revenue: Rs.${subTotalRev.toLocaleString('en-IN')} | Received: Rs.${subTotalRec.toLocaleString('en-IN')} | Outstanding: Rs.${subTotalOut.toLocaleString('en-IN')}`, 14, 30);

    let y = 40;
    doc.setFontSize(9);
    doc.text('Order ID', 14, y);
    doc.text('Customer Name', 45, y);
    doc.text('Event Name', 90, y);
    doc.text('Revenue', 140, y);
    doc.text('Received', 170, y);
    doc.text('Balance', 200, y);
    doc.text('Status', 230, y);

    y += 4;
    doc.line(14, y, 280, y);
    y += 6;

    dataToExport.forEach(r => {
      if (y > 180) {
        doc.addPage();
        y = 20;
      }
      const displayEvName = (r.matchingEvents && r.matchingEvents.length > 0)
        ? r.matchingEvents.map(e => e.event_name || e.event_type || 'Event').join(' | ')
        : (r.eventName || '');

      doc.text(String(r.orderId || ''), 14, y);
      doc.text(String(r.customerName || '').substring(0, 20), 45, y);
      doc.text(String(displayEvName).substring(0, 22), 90, y);
      doc.text(`Rs.${r.totalRevenue || 0}`, 140, y);
      doc.text(`Rs.${r.paymentReceived || 0}`, 170, y);
      doc.text(`Rs.${r.outstanding || 0}`, 200, y);
      doc.text(String(r.currentStage || '').substring(0, 18), 230, y);
      y += 6;
    });

    doc.save(`${cardTitle}_Report_${startDate || 'all'}_to_${endDate || 'all'}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header Banner */}
      <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-blue-400 font-mono flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>REVENUE & PAYMENT SUMMARY</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Summary financial breakdown, search records, and downloadable executive reports.
          </p>
        </div>

        {/* Period Filter & Filter / Download Button */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 text-amber-400 font-mono text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="this_month">THIS MONTH</option>
            <option value="last_month">LAST MONTH</option>
            <option value="last_3_months">LAST 3 MONTHS</option>
          </select>

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
      </div>

      {/* Revenue & Payment Summary Filter & Export Panel (scoped strictly to this Revenue section) */}
      {showFilters && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4 animate-in fade-in duration-200 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                Revenue & Payment Summary Filters
              </span>
              <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                Revenue Section Only
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-zinc-850 transition-colors cursor-pointer"
              title="Close filter panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Subtab Selector hidden visually per user requirement */}
            <div className="hidden">
              <button type="button" onClick={() => setPaymentTab('all')}>All Records</button>
              <button type="button" onClick={() => setPaymentTab('pending')}>Pending Payments</button>
              <button type="button" onClick={() => setPaymentTab('history')}>Payment History</button>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Order ID, Customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Dates */}
            <div className="flex items-center gap-2 text-xs font-mono w-full sm:w-auto">
              <span className="text-zinc-500 uppercase text-[10px] font-bold">Dates:</span>
              <div className="w-32">
                <DateFilterInput
                  value={startDate}
                  onChange={setStartDate}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-zinc-200 text-xs"
                />
              </div>
              <span className="text-zinc-600">to</span>
              <div className="w-32">
                <DateFilterInput
                  value={endDate}
                  onChange={setEndDate}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-zinc-200 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Download Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-zinc-900">
            <span className="text-[11px] font-mono text-zinc-400">
              Active Records in Revenue: <span className="text-amber-400 font-bold">{filtered.length}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider mr-1">Download:</span>
              <button
                onClick={downloadPDF}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-rose-400" />
                <span>PDF</span>
              </button>
              <button
                onClick={downloadExcel}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                onClick={downloadCSV}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Revenue & Payment Summary Box (3 summary cards hidden per requirement) */}
      <div className="hidden bg-zinc-950 border border-zinc-850 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
          <div className="text-xs font-mono font-bold text-amber-400 tracking-wider uppercase">
            {getPeriodLabel(selectedPeriod)}
          </div>
          <div className="text-[11px] font-mono text-zinc-400">
            Active Range: <span className="text-zinc-200">{formatDateDDMMYY(startDate)}</span> – <span className="text-zinc-200">{formatDateDDMMYY(endDate)}</span>
          </div>
        </div>

        <div className="hidden grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="hidden bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">TOTAL SALES</span>
            <div className="text-2xl font-black text-white font-mono mt-2">{formatINR(totalRevSum)}</div>
            <span className="text-[10px] font-mono text-blue-400 mt-1">Total order/sale value for selected period</span>
          </div>

          <div className="hidden bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">ADVANCE / PAYMENT RECEIVED</span>
            <div className="text-2xl font-black text-emerald-400 font-mono mt-2">{formatINR(totalRecSum)}</div>
            <span className="text-[10px] font-mono text-emerald-500/80 mt-1">Approved collections (Excl. Waiting Approval)</span>
          </div>

          <div className="hidden bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">BALANCE / PENDING</span>
            <div className="text-2xl font-black text-rose-400 font-mono mt-2">{formatINR(totalOutSum)}</div>
            <span className="text-[10px] font-mono text-rose-400/80 mt-1">Amount still pending / due</span>
          </div>
        </div>
      </div>

      {/* Summary KPI Highlights Row */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        <CameraLensStatsCard
          label="Total Revenue"
          val={totalRevSum}
          isCurrency={true}
          currencyFormatter={formatINR}
          theme="blue"
          trendText="Gross Value"
          lensLabel="PRIME 50mm"
          chartPoints={[25, 35, 30, 45, 40, 55, 60]}
          onClick={() => setSelectedCard('summary_revenue')}
        />
        <CameraLensStatsCard
          label="Payment Received"
          val={totalRecSum}
          isCurrency={true}
          currencyFormatter={formatINR}
          theme="emerald"
          trendText="Collections"
          lensLabel="CINE 35mm"
          chartPoints={[20, 28, 25, 38, 35, 48, 52]}
          onClick={() => setSelectedCard('summary_payment')}
        />
        <CameraLensStatsCard
          label="Outstanding"
          val={totalOutSum}
          isCurrency={true}
          currencyFormatter={formatINR}
          theme="red"
          trendText="Balance Due"
          lensLabel="TELE 85mm"
          chartPoints={[15, 12, 18, 14, 10, 12, 8]}
          onClick={() => setSelectedCard('summary_outstanding')}
        />
        <CameraLensStatsCard
          label="Completed"
          val={completedCount}
          theme="amber"
          trendText="Projects Wrapped"
          lensLabel="PRIME 24mm"
          chartPoints={[10, 15, 12, 20, 18, 25, 28]}
          onClick={() => setSelectedCard('summary_completed')}
        />
        <CameraLensStatsCard
          label="Closed Orders"
          val={closedCount}
          theme="indigo"
          trendText="Settled Orders"
          lensLabel="TELE 135mm"
          chartPoints={[8, 12, 10, 16, 15, 22, 24]}
          onClick={() => setSelectedCard('summary_closed')}
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-2xl">
        {/* Filtered Table Top Bar with Title & Download Report options */}
        <div className="p-4 bg-zinc-900/70 border-b border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={`w-2.5 h-2.5 rounded-full ${
              selectedCard === 'summary_revenue' ? 'bg-blue-400'
              : selectedCard === 'summary_payment' ? 'bg-emerald-400'
              : selectedCard === 'summary_outstanding' ? 'bg-rose-400'
              : selectedCard === 'summary_completed' ? 'bg-amber-400'
              : selectedCard === 'summary_closed' ? 'bg-indigo-400'
              : 'bg-amber-400'
            }`} />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
              {selectedCard === 'summary_revenue' && 'Total Revenue Records'}
              {selectedCard === 'summary_payment' && 'Payment Received Records'}
              {selectedCard === 'summary_outstanding' && 'Outstanding / Pending Records'}
              {selectedCard === 'summary_completed' && 'Completed Projects Records'}
              {selectedCard === 'summary_closed' && 'Closed Orders Records'}
              {!selectedCard && 'All Revenue & Payment Records'}
            </span>
            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {filtered.length} {filtered.length === 1 ? 'Record' : 'Records'}
            </span>
            {startDate && endDate && (
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                {formatDateDDMMYY(startDate)} – {formatDateDDMMYY(endDate)}
              </span>
            )}
            {selectedCard && (
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="text-[10px] font-mono text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 px-2 py-0.5 rounded border border-zinc-700 transition-colors cursor-pointer ml-1"
                title="Reset card filter and show all"
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Download Report options for displayed/filtered data */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider mr-1">Download Report:</span>
            <button
              type="button"
              onClick={downloadPDF}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5 text-rose-400" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={downloadExcel}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              title="Download Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={downloadCSV}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Event Name & Date</th>
                <th className="py-3 px-4">Assigned Staff</th>
                <th className="py-3 px-4">Total Revenue</th>
                <th className="py-3 px-4">Payment Received</th>
                <th className="py-3 px-4">Outstanding</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4">Current Stage</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850 font-mono">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-500">
                    No matching revenue records found for selected query and date range.
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.orderId} className={`hover:bg-zinc-900/50 transition-colors ${r.hasPendingApproval ? 'animate-row-blink bg-amber-500/10 border border-amber-500/30' : ''}`}>
                    <td className="py-3.5 px-4 font-bold text-amber-400">{r.orderId}</td>
                    <td className="py-3.5 px-4 font-sans font-bold text-zinc-200">{r.customerName}</td>
                    <td className="py-3.5 px-4 font-sans text-zinc-300">
                      {r.matchingEvents && r.matchingEvents.length > 1 ? (
                        <div className="space-y-1.5">
                          {r.matchingEvents.map((ev: any, idx: number) => (
                            <div key={idx} className={idx > 0 ? "pt-1 border-t border-zinc-800/60" : ""}>
                              <div className="font-semibold text-zinc-200">{ev.event_name || ev.event_type || `Event ${idx + 1}`}</div>
                              <div className="text-[10px] font-mono text-zinc-500">{formatDateDDMMYY(ev.event_date || ev.event_start_date)}</div>
                            </div>
                          ))}
                        </div>
                      ) : r.matchingEvents && r.matchingEvents.length === 1 ? (
                        <div>
                          <div className="font-semibold text-zinc-200">{r.matchingEvents[0].event_name || r.matchingEvents[0].event_type || r.eventName}</div>
                          <div className="text-[10px] font-mono text-zinc-500">{formatDateDDMMYY(r.matchingEvents[0].event_date || r.eventDate)}</div>
                        </div>
                      ) : (
                        <div>
                          <div>{r.eventName}</div>
                          <div className="text-[10px] font-mono text-zinc-500">{formatDateDDMMYY(r.eventDate)}</div>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-sans">
                      <AssignedStaffDropdown orderId={r.orderId} leadId={r.leadId} />
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">{formatINR(r.totalRevenue)}</td>
                    <td className="py-3.5 px-4">
                      <button
                        onClick={() => setSelectedPaymentHistoryOrder(r)}
                        className="text-emerald-400 font-bold hover:text-emerald-300 hover:underline transition-colors focus:outline-none"
                      >
                        {formatINR(r.paymentReceived)}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-rose-400 font-bold">{formatINR(r.outstanding)}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        r.paymentStatus === 'Fully Paid'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : r.paymentStatus === 'Waiting for Approval'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          : r.paymentStatus === 'Partially Paid'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px]">
                        {r.currentStage}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const fullOrder = orders.find(o => o.order_id === r.orderId || o.lead_id === r.leadId) || r;
                            setSelectedPaymentHistoryOrder(fullOrder);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
                          title="View Payment Details & Approval"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>View/Details</span>
                        </button>
                        <select
                          onChange={(e) => {
                            const val = e.target.value;
                            const fullOrder = orders.find(o => o.order_id === r.orderId || o.lead_id === r.leadId) || r;
                            if (val === 'payment_history') {
                              setSelectedPaymentHistoryOrder(fullOrder);
                            } else if (val === 'add_note') {
                              setNoteModalOrder(fullOrder);
                            }
                            e.target.value = "";
                          }}
                          defaultValue=""
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer shadow-sm focus:outline-none bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                          title="More Actions"
                        >
                          <option value="" disabled>More ▾</option>
                          <option value="payment_history">Payment Details</option>
                          <option value="add_note">VIEW/ADD NOTE</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CARD DETAIL POPUP/MODAL */}
      <BusinessOwnerCardDetailModal
        isOpen={selectedCard !== null && selectedCard.startsWith('summary_')}
        onClose={() => setSelectedCard(null)}
        title={modalTitleAndMeta.title}
        subtitle={startDate && endDate ? `${formatDateDDMMYY(startDate)} – ${formatDateDDMMYY(endDate)}` : ''}
        accentColor={modalTitleAndMeta.accentColor}
        data={modalData}
        columns={modalColumns}
        totalLabel={modalTitleAndMeta.totalLabel}
        totalValue={modalTitleAndMeta.totalValue}
        filterDescription={modalTitleAndMeta.filterDescription}
        onDownloadPDF={downloadPDF}
        onDownloadExcel={downloadExcel}
        onDownloadCSV={downloadCSV}
      />

      {/* PAYMENT HISTORY MODAL */}
      <PaymentHistoryModal
        isOpen={selectedPaymentHistoryOrder !== null}
        onClose={() => setSelectedPaymentHistoryOrder(null)}
        order={selectedPaymentHistoryOrder}
        payments={payments}
        orders={orders}
        leads={leads}
      />

      {/* ORDER HISTORY & TIMELINE AUDIT MODAL */}
      <OrderHistoryModal
        isOpen={selectedHistoryOrder !== null}
        onClose={() => setSelectedHistoryOrder(null)}
        order={selectedHistoryOrder}
      />

      {/* ADD NOTE MODAL */}
      {noteModalOrder && (
        <AddNoteModal
          isOpen={noteModalOrder !== null}
          onClose={() => setNoteModalOrder(null)}
          leadId={noteModalOrder.lead_id || noteModalOrder.order_id}
          orderId={noteModalOrder.order_id}
          customerName={noteModalOrder.customer_name || 'Customer'}
        />
      )}

    </div>
  );
};

/* ============================================================================
   REVIEW & CLOSE MODAL
   ============================================================================ */
interface ReviewAndCloseModalProps {
  order: Order;
  leads: Lead[];
  production: Production[];
  payments: Payment[];
  currentRole?: UserRole;
  onClose: () => void;
  onApprove: () => Promise<void> | void;
  onReject?: () => void;
}

function formatDeliverableDisplay(item: any): string {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return String(item);
  if (typeof item === 'object') {
    const name = item.name || item.text || item.deliverable || item.title || item.label || '';
    const qty = item.qty || item.quantity || item.count || 1;
    if (name) {
      return Number(qty) > 1 ? `${qty} × ${name}` : String(name);
    }
    return '';
  }
  return String(item);
}

const ReviewAndCloseModal: React.FC<ReviewAndCloseModalProps> = ({
  order,
  leads = [],
  production = [],
  payments = [],
  currentRole = 'Business Owner',
  onClose,
  onApprove,
  onReject
}) => {
  const { editorAssignments = [], quotations = [] } = useRole();
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const handleApproveSubmit = async () => {
    if (isApproving) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      await onApprove();
      // Auto-close is handled by parent resetting the modal order state
    } catch (err: any) {
      setApproveError(err.message || "Database update failed");
      setIsApproving(false);
    }
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.minHeight = '';
      document.body.style.position = '';
      document.body.style.padding = '';
      document.body.style.margin = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.documentElement.style.minHeight = '';
    };
  }, []);

  const lead = (leads || []).find(l => l && (order && (l.lead_id === order.lead_id || l.lead_id === order.order_id)));
  const prod = (production || []).find(p => p && (order && (p.tracking_id === order.lead_id || p.order_id === order.lead_id || p.tracking_id === order.order_id || p.order_id === order.order_id)));
  const pay = (payments || []).find(p => p && (order && (p.order_id === order.order_id || p.lead_id === order.lead_id || p.order_id === order.lead_id)));

  const customerMobile = order?.customer_phone || order?.mobile || lead?.phone || lead?.mobile || pay?.customer_phone || 'N/A';
  const isBusinessOwner = currentRole === 'Business Owner';

  // Extract ALL events separately for this order
  const resolvedEvents = useMemo(() => {
    try {
      const rawLeadEvents = lead?.events && Array.isArray(lead.events) && lead.events.length > 0 ? lead.events : [];
      const deserialized = (!rawLeadEvents || rawLeadEvents.length === 0) && (lead?.notes_special_customizations || order?.notes_special_customizations)
        ? deserializeLeadEvents(lead?.notes_special_customizations || order?.notes_special_customizations).events
        : [];

      const combined = rawLeadEvents.length > 0 ? rawLeadEvents : (deserialized.length > 0 ? deserialized : []);

      if (combined && combined.length > 0) {
        return combined.map((ev: any, idx: number) => {
          if (!ev) return {
            id: `ev_${idx + 1}`,
            eventName: `Event ${idx + 1}`,
            eventType: 'Photography & Videography',
            eventDate: order?.event_date || 'N/A',
            eventTime: order?.event_time || 'N/A',
            eventLocation: order?.location || 'N/A',
            googleMapsLink: null,
            deliverables: ['Full Coverage'],
            assignments: []
          };

          const rawEType = ev.event_type || lead?.event_type || order?.event_type || 'N/A';
          const eType = rawEType === 'Other' ? (ev.custom_event_type || 'Other') : rawEType;

          let eName = 'N/A';
          if (ev.event_name === 'Other') {
            eName = ev.custom_event_name || 'Other';
          } else if (ev.custom_event_name && ev.custom_event_name.trim() !== '') {
            eName = ev.custom_event_name;
          } else if (ev.event_name && ev.event_name.trim() !== '') {
            eName = ev.event_name;
          } else if (eType && eType !== 'N/A') {
            eName = eType;
          } else {
            eName = `Event ${idx + 1}`;
          }

          const eDate = ev.event_date || order?.event_date || lead?.event_date || 'N/A';
          const eTime = ev.event_start_time || ev.event_time || order?.event_time || lead?.event_time || 'N/A';
          const eLocation = ev.venue || ev.location || order?.venue || order?.location || lead?.venue || lead?.location || 'N/A';
          const eMapsLink = ev.google_maps_link || order?.google_maps_link || lead?.google_maps_link || null;

          // Deliverables assigned for this event
          const matchedAssignments = (editorAssignments || []).filter((a: any) =>
            a && (a.event_id === ev.event_id || a.event_id === ev.id || a.event_id === `ev_${idx + 1}`)
          );

          let deliverablesList: string[] = [];
          if (ev.deliverables && Array.isArray(ev.deliverables) && ev.deliverables.length > 0) {
            deliverablesList = ev.deliverables.map(formatDeliverableDisplay).filter(Boolean);
          } else if (ev.assigned_deliverables && Array.isArray(ev.assigned_deliverables) && ev.assigned_deliverables.length > 0) {
            deliverablesList = ev.assigned_deliverables.map(formatDeliverableDisplay).filter(Boolean);
          } else if (matchedAssignments.length > 0) {
            deliverablesList = matchedAssignments.map((a: any) => `${a.speciality || 'Deliverable'} (${a.staff_name || 'Editor'})`);
          } else {
            deliverablesList = order?.deliverables && Array.isArray(order.deliverables) && order.deliverables.length > 0
              ? order.deliverables.map(formatDeliverableDisplay).filter(Boolean)
              : [order?.custom_event_name || order?.event_type || 'Full Coverage'];
          }

          return {
            id: ev.event_id || ev.id || `ev_${idx + 1}`,
            eventName: eName,
            eventType: eType,
            eventDate: eDate,
            eventTime: eTime,
            eventLocation: eLocation,
            googleMapsLink: eMapsLink,
            deliverables: deliverablesList,
            assignments: matchedAssignments
          };
        });
      }

      // Fallback single event if no event array exists
      const eName = order?.custom_event_name || order?.event_name || order?.event_type || lead?.custom_event_name || lead?.event_type || 'Photography & Videography';
      const eType = order?.event_type || lead?.event_type || 'N/A';
      const eDate = order?.event_date || lead?.event_date || 'N/A';
      const eTime = order?.event_time || lead?.event_time || 'N/A';
      const eLocation = order?.venue || order?.location || lead?.venue || lead?.location || 'N/A';
      const eMapsLink = order?.google_maps_link || lead?.google_maps_link || null;

      const orderAssignments = (editorAssignments || []).filter((a: any) =>
        a && (
          a.production_id === prod?.production_id ||
          a.order_id === order?.order_id ||
          a.order_id === order?.lead_id ||
          a.order_id === prod?.tracking_id
        )
      );

      let delivs = order?.deliverables && Array.isArray(order.deliverables) && order.deliverables.length > 0
        ? order.deliverables.map(formatDeliverableDisplay).filter(Boolean)
        : prod?.deliverables && Array.isArray(prod.deliverables)
        ? prod.deliverables.map(formatDeliverableDisplay).filter(Boolean)
        : [];

      if (delivs.length === 0 && orderAssignments.length > 0) {
        delivs = orderAssignments.map((a: any) => `${a.speciality || 'Deliverable'} (${a.staff_name || 'Editor'})`);
      }
      if (delivs.length === 0) {
        delivs = ['Full Coverage'];
      }

      return [{
        id: order?.event_id || 'ev_1',
        eventName: eName,
        eventType: eType,
        eventDate: eDate,
        eventTime: eTime,
        eventLocation: eLocation,
        googleMapsLink: eMapsLink,
        deliverables: delivs,
        assignments: orderAssignments
      }];
    } catch (e) {
      console.warn("Error resolving events for Review modal:", e);
      return [{
        id: 'ev_fallback',
        eventName: order?.custom_event_name || order?.event_type || 'Photography & Videography',
        eventType: order?.event_type || 'Standard Event',
        eventDate: order?.event_date || 'N/A',
        eventTime: order?.event_time || 'N/A',
        eventLocation: order?.location || 'N/A',
        googleMapsLink: null,
        deliverables: ['Full Coverage'],
        assignments: []
      }];
    }
  }, [order, lead, prod, editorAssignments]);

  if (!order || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl 2xl:max-w-5xl min-[1920px]:max-w-[1200px] min-[2560px]:max-w-[1600px] min-[3840px]:max-w-[2000px] shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-850 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                Business Owner Review
              </span>
              <span className="text-xs font-mono text-zinc-500 truncate">Order ID: {order?.order_id || 'N/A'}</span>
            </div>
            <h2 className="text-xl font-black text-white">
              Final Approval & Order Review
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 hidden sm:block">
              Review completed workflow and client acceptance before closing this order.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Section 1: Customer Details */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
              <User className="w-3.5 h-3.5" />
              <span>Customer Details</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Customer Name</span>
                <span className="text-zinc-100 font-bold">{order?.customer_name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Mobile Number</span>
                <span className="text-zinc-200 font-mono">{customerMobile}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Order ID</span>
                <span className="text-amber-400 font-mono font-bold">{order?.order_id || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: ALL Events (MULTIPLE EVENTS SEPARATELY) */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Event Details ({resolvedEvents.length})</span>
              </h3>
              <span className="text-[10px] font-mono text-zinc-500 uppercase hidden sm:block">
                {resolvedEvents.length} Event{resolvedEvents.length > 1 ? 's' : ''} in Order
              </span>
            </div>

            <div className="space-y-3">
              {resolvedEvents.map((ev, idx) => (
                <div key={ev.id || idx} className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                      EVENT {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-zinc-200">{ev.eventName}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="sm:col-span-2 md:col-span-1">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Event Name</span>
                      <span className="text-zinc-100 font-bold">{ev.eventName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Event Type</span>
                      <span className="text-zinc-200 font-mono">{ev.eventType}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Event Date</span>
                      <span className="text-zinc-200 font-mono">{formatDateDDMMYY(ev.eventDate) || ev.eventDate}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold">Event Time</span>
                      <span className="text-zinc-200 font-mono">{formatTime12Hour(ev.eventTime) || ev.eventTime || 'N/A'}</span>
                    </div>
                    <div className="sm:col-span-2 md:col-span-3">
                      <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold mb-1">Event Location / Google Maps Link</span>
                      {ev.googleMapsLink ? (
                        <a 
                          href={ev.googleMapsLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[11px] font-mono font-bold transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate max-w-[200px] sm:max-w-xs">Open Google Maps</span>
                        </a>
                      ) : (
                        <span className="text-zinc-200 font-mono truncate block" title={ev.eventLocation}>
                          {ev.eventLocation && ev.eventLocation !== 'N/A' ? ev.eventLocation : 'N/A'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Assigned Deliverables */}
                  <div className="pt-2 border-t border-zinc-900/80">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 block font-bold mb-1">Assigned Deliverables</span>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.isArray(ev.deliverables) && ev.deliverables.length > 0 ? (
                        ev.deliverables.map((deliv: any, dIdx: number) => (
                          <span key={dIdx} className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[11px] font-mono">
                            {formatDeliverableDisplay(deliv)}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-500 italic text-xs font-mono">No specific deliverables listed</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Action Bar */}
        <div className="p-4 sm:p-6 pt-4 border-t border-zinc-850 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 bg-zinc-950 rounded-b-2xl">
          <p className="text-xs text-zinc-500 text-center sm:text-left">
            {isBusinessOwner ? (
              <>Confirms final verification. The order status will automatically update to <strong className="text-emerald-400">Order Closed</strong>.</>
            ) : (
              <span className="text-amber-400 font-bold">Only the Business Owner role can close orders.</span>
            )}
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto relative">
            {approveError && (
              <div className="absolute bottom-[calc(100%+24px)] right-0 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold text-center flex items-center justify-center gap-2 z-10 w-full sm:w-max max-w-sm whitespace-normal shadow-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>ORDER CLOSE FAILED: {approveError}</span>
              </div>
            )}
            <button
              onClick={onClose}
              disabled={isApproving}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>

            {/* Reject button hidden as per user request */}

            {isBusinessOwner && (
              <button
                onClick={handleApproveSubmit}
                disabled={isApproving}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-black font-black text-xs hover:bg-amber-400 transition-all cursor-pointer shadow-lg flex justify-center items-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isApproving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Approving & Closing...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Approve & Close Order</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

/* ============================================================================
   UNLOCK REQUEST REVIEW MODAL
   ============================================================================ */
interface UnlockRequestReviewModalProps {
  unlockRequestModal: any;
  onClose: () => void;
  onReject: (item: any) => void;
  onApprove: (item: any) => void;
}

const UnlockRequestReviewModal: React.FC<UnlockRequestReviewModalProps> = ({
  unlockRequestModal,
  onClose,
  onReject,
  onApprove
}) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.minHeight = '';
      document.body.style.position = '';
      document.body.style.padding = '';
      document.body.style.margin = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.documentElement.style.minHeight = '';
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/85 z-[200] flex items-center justify-center p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-md w-full shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans">
            <Ban className="w-4 h-4 text-amber-500" /> Review Quotation Unlock
          </h4>
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-slate-350 cursor-pointer animate-none border-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-400 font-medium mb-1">Order ID / Lead ID</div>
              <div className="text-amber-400 font-mono font-bold">{unlockRequestModal.order_id || unlockRequestModal.project_id || '-'}</div>
              <div className="text-indigo-400 font-mono text-[10px]">{unlockRequestModal.lead_id || '-'}</div>
            </div>
            <div>
              <div className="text-slate-400 font-medium mb-1">Customer Name</div>
              <div className="text-white font-bold text-sm">{unlockRequestModal.customer_name || '-'}</div>
            </div>
            <div>
              <div className="text-slate-400 font-medium mb-1">Sales Staff</div>
              <div className="text-white font-medium">{unlockRequestModal.sales_staff_name || '-'}</div>
              <div className="text-slate-400 text-[10px] font-mono">{unlockRequestModal.sales_staff_mobile || '-'}</div>
            </div>
            <div>
              <div className="text-slate-400 font-medium mb-1">Request Date</div>
              <div className="text-slate-300 font-mono">{(unlockRequestModal.requested_at || unlockRequestModal.created_at) ? formatDateDDMMYY(unlockRequestModal.requested_at || unlockRequestModal.created_at) : '-'}</div>
            </div>
          </div>
          
          <div className="bg-slate-900 border border-slate-750 p-3 rounded-lg text-xs">
            <div className="text-slate-400 font-medium mb-1 border-b border-slate-800 pb-1">Reason</div>
            <div className="text-amber-300 font-bold mt-1.5">{unlockRequestModal.reason || unlockRequestModal.request_reason || unlockRequestModal.title || 'Quotation unlock requested'}</div>
            {unlockRequestModal.custom_reason && (
              <div className="text-slate-300 mt-2 bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-500 text-[10px] block mb-1">Custom Reason:</span>
                {unlockRequestModal.custom_reason}
              </div>
            )}
          </div>
          
          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-[11px] text-amber-200/80">
            Approving this request will move the project back to the <strong className="text-amber-400">Negotiation</strong> stage, allowing the sales staff to modify the quotation.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs font-bold transition-colors border-0"
          >
            Cancel
          </button>
          <button
            onClick={() => onReject(unlockRequestModal)}
            className="px-3 py-2 bg-rose-950 hover:bg-rose-900 text-rose-400 border border-rose-900/50 rounded-xl cursor-pointer text-xs font-bold transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => onApprove(unlockRequestModal)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl cursor-pointer text-xs font-bold shadow-lg transition-colors border-0"
          >
            Approve Unlock
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ============================================================================
   CALENDAR EVENT DETAIL MODAL (READ-ONLY TABLE)
   ============================================================================ */
interface CalendarEventDetailModalProps {
  event: any;
  onClose: () => void;
  onReviewAndClose: (orderObj: Order) => void;
}

const CalendarEventDetailModal: React.FC<CalendarEventDetailModalProps> = ({
  event,
  onClose
}) => {
  const { leads, staffAssignments } = useRole();
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.minHeight = '';
      document.body.style.position = '';
      document.body.style.padding = '';
      document.body.style.margin = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.documentElement.style.minHeight = '';
    };
  }, []);

  if (typeof document === 'undefined') return null;

  const eventList: any[] = event?.events ? event.events : [event];
  const dateStr = event?.date || eventList[0]?.eventDate || '';

  const formatReportingDate = (dateVal: string | null | undefined): string => {
    if (!dateVal || dateVal === '—' || dateVal === 'null' || dateVal === 'undefined') return '—';
    return formatDateDDMMYY(dateVal) || String(dateVal);
  };

  const getReportingDate = (ev: any): string => {
    let rawDate: string | null = null;
    if (ev?.rawEvent?.Reporting_date && String(ev.rawEvent.Reporting_date).trim() && ev.rawEvent.Reporting_date !== 'null') {
      rawDate = String(ev.rawEvent.Reporting_date).trim();
    } else if (ev?.rawEvent?.reporting_date && String(ev.rawEvent.reporting_date).trim() && ev.rawEvent.reporting_date !== 'null') {
      rawDate = String(ev.rawEvent.reporting_date).trim();
    } else if (ev?.rawLead?.Reporting_date && String(ev.rawLead.Reporting_date).trim() && ev.rawLead.Reporting_date !== 'null') {
      rawDate = String(ev.rawLead.Reporting_date).trim();
    } else if (ev?.rawLead?.reporting_date && String(ev.rawLead.reporting_date).trim() && ev.rawLead.reporting_date !== 'null') {
      rawDate = String(ev.rawLead.reporting_date).trim();
    }

    if (!rawDate) {
      const effLeadId = ev.rawLead?.lead_id || ev.rawOrder?.lead_id || ev.orderId;
      const lObj = leads?.find(l => (effLeadId && (l.lead_id === effLeadId || l.order_id === effLeadId)));
      if (lObj?.events && Array.isArray(lObj.events)) {
        const match = lObj.events.find((e: any) =>
          (ev?.id && (e.id === ev.id || e.event_id === ev.id)) ||
          (ev?.eventName && (e.event_name === ev.eventName || e.custom_event_name === ev.eventName))
        );
        if (match?.Reporting_date && String(match.Reporting_date).trim() && match.Reporting_date !== 'null') {
          rawDate = String(match.Reporting_date).trim();
        } else if (match?.reporting_date && String(match.reporting_date).trim() && match.reporting_date !== 'null') {
          rawDate = String(match.reporting_date).trim();
        }
      }
      if (!rawDate && lObj) {
        if (lObj.Reporting_date && String(lObj.Reporting_date).trim() && lObj.Reporting_date !== 'null') {
          rawDate = String(lObj.Reporting_date).trim();
        } else if (lObj.reporting_date && String(lObj.reporting_date).trim() && lObj.reporting_date !== 'null') {
          rawDate = String(lObj.reporting_date).trim();
        }
      }
    }

    if (!rawDate) return '—';
    return formatReportingDate(rawDate);
  };

  const getReportingTime = (ev: any): string => {
    let rawTime: string | null = null;
    if (ev?.rawEvent?.reporting_time && String(ev.rawEvent.reporting_time).trim() && ev.rawEvent.reporting_time !== 'null') {
      rawTime = String(ev.rawEvent.reporting_time).trim();
    } else if (ev?.rawEvent?.Reporting_time && String(ev.rawEvent.Reporting_time).trim() && ev.rawEvent.Reporting_time !== 'null') {
      rawTime = String(ev.rawEvent.Reporting_time).trim();
    } else if (ev?.rawLead?.reporting_time && String(ev.rawLead.reporting_time).trim() && ev.rawLead.reporting_time !== 'null') {
      rawTime = String(ev.rawLead.reporting_time).trim();
    }

    if (!rawTime) {
      const effLeadId = ev.rawLead?.lead_id || ev.rawOrder?.lead_id || ev.orderId;
      const lObj = leads?.find(l => (effLeadId && (l.lead_id === effLeadId || l.order_id === effLeadId)));
      if (lObj?.events && Array.isArray(lObj.events)) {
        const match = lObj.events.find((e: any) =>
          (ev?.id && (e.id === ev.id || e.event_id === ev.id)) ||
          (ev?.eventName && (e.event_name === ev.eventName || e.custom_event_name === ev.eventName))
        );
        if (match?.reporting_time && String(match.reporting_time).trim() && match.reporting_time !== 'null') {
          rawTime = String(match.reporting_time).trim();
        }
      }
      if (!rawTime && lObj?.reporting_time && String(lObj.reporting_time).trim() && lObj.reporting_time !== 'null') {
        rawTime = String(lObj.reporting_time).trim();
      }
    }

    if (!rawTime || rawTime === '—' || rawTime === 'N/A') return '—';
    return formatTime12Hour(rawTime);
  };

  const getLocation = (ev: any): string => {
    if (ev.location && ev.location !== '—' && ev.location !== 'N/A') return ev.location;
    if (ev.rawEvent?.location && ev.rawEvent.location !== '—' && ev.rawEvent.location !== 'N/A') return ev.rawEvent.location;
    if (ev.rawEvent?.venue && ev.rawEvent.venue !== '—' && ev.rawEvent.venue !== 'N/A') return ev.rawEvent.venue;
    if (ev.rawEvent?.event_location && ev.rawEvent.event_location !== '—' && ev.rawEvent.event_location !== 'N/A') return ev.rawEvent.event_location;
    if (ev.rawOrder?.event_location && ev.rawOrder.event_location !== '—' && ev.rawOrder.event_location !== 'N/A') return ev.rawOrder.event_location;
    if (ev.rawLead?.event_location && ev.rawLead.event_location !== '—' && ev.rawLead.event_location !== 'N/A') return ev.rawLead.event_location;
    if (ev.venue && ev.venue !== '—' && ev.venue !== 'N/A') return ev.venue;
    return '—';
  };

  const getAssignedRole = (ev: any): string => {
    const effOrderId = ev.orderId || ev.rawOrder?.order_id;
    const effLeadId = ev.rawLead?.lead_id || ev.rawOrder?.lead_id || effOrderId;
    const roles: string[] = [];

    const matchingSAs = (staffAssignments || []).filter(sa => {
      if (sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return false;
      return (effOrderId && (sa.order_id === effOrderId || sa.lead_id === effOrderId)) ||
             (effLeadId && (sa.lead_id === effLeadId || sa.order_id === effLeadId));
    });

    matchingSAs.forEach(sa => {
      const r = (sa.staff_role || (sa as any).role || '').trim();
      if (r && !roles.includes(r)) roles.push(r);
    });

    return roles.length > 0 ? roles.join(', ') : 'Not assigned';
  };

  const getEquipmentDetails = (ev: any): string[] => {
    const effOrderId = ev.orderId || ev.rawOrder?.order_id;
    const effLeadId = ev.rawLead?.lead_id || ev.rawOrder?.lead_id || effOrderId;
    const eqSet = new Set<string>();

    const extractEq = (rawEq: any) => {
      if (!rawEq) return;
      if (Array.isArray(rawEq)) {
        rawEq.forEach((item: any) => {
          if (typeof item === 'string' && item.trim()) {
            const clean = item.trim();
            if (clean.toLowerCase() !== 'none' && clean.toLowerCase() !== 'not assigned' && clean.toLowerCase() !== 'null' && clean.toLowerCase() !== 'undefined') {
              eqSet.add(clean);
            }
          } else if (item && typeof item === 'object' && (item.name || item.equipment_name)) {
            const clean = (item.name || item.equipment_name).trim();
            if (clean) eqSet.add(clean);
          }
        });
      } else if (typeof rawEq === 'string') {
        const trimmed = rawEq.trim();
        if (trimmed && trimmed.toLowerCase() !== 'none' && trimmed.toLowerCase() !== 'not assigned' && trimmed.toLowerCase() !== 'null' && trimmed.toLowerCase() !== 'undefined') {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              parsed.forEach((p: any) => {
                if (typeof p === 'string' && p.trim()) eqSet.add(p.trim());
                else if (p && typeof p === 'object' && (p.name || p.equipment_name)) eqSet.add((p.name || p.equipment_name).trim());
              });
              return;
            }
          } catch (_) {}
          trimmed.split(',').forEach((s: string) => {
            const c = s.trim();
            if (c && c.toLowerCase() !== 'none' && c.toLowerCase() !== 'not assigned') eqSet.add(c);
          });
        }
      }
    };

    const matchingSAs = (staffAssignments || []).filter(sa => {
      if (sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return false;
      return (effOrderId && (sa.order_id === effOrderId || sa.lead_id === effOrderId)) ||
             (effLeadId && (sa.lead_id === effLeadId || sa.order_id === effLeadId));
    });

    matchingSAs.forEach(sa => {
      extractEq(sa.equipment);
      extractEq(sa.assigned_equipment);
      extractEq(sa.equipment_details);
    });

    extractEq(ev.rawEvent?.assigned_equipment);
    extractEq(ev.rawEvent?.equipment);

    return Array.from(eqSet);
  };

  const activeEv = eventList[selectedIdx] || eventList[0];
  const orderDisplayId = activeEv?.orderId || activeEv?.rawOrder?.order_id || activeEv?.rawLead?.lead_id || '—';
  const custName = activeEv?.customerName || activeEv?.rawOrder?.customer_name || activeEv?.rawLead?.customer_name || '—';
  const evType = activeEv?.rawEvent?.event_type || activeEv?.rawOrder?.event_type || activeEv?.eventName || 'Event';
  const repDate = getReportingDate(activeEv);
  const repTime = getReportingTime(activeEv);
  const assignedRole = getAssignedRole(activeEv);
  const eqList = getEquipmentDetails(activeEv);
  const status = activeEv?.currentStatus || activeEv?.rawOrder?.current_stage || activeEv?.rawLead?.status || 'Confirmed';

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1600px] p-4 sm:p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-850 shrink-0">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-500 block">
              EVENT DETAILS
            </span>
            <h3 className="text-base sm:text-lg font-black text-white mt-0.5 font-mono flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-amber-500 shrink-0" />
              <span>{formatDateDDMMYY(dateStr) || dateStr || 'Event Details'}</span>
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg select-none">
              {eventList.length} {eventList.length === 1 ? 'EVENT' : 'EVENTS'}
            </span>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Genuine Horizontal Scrollable Table on all screen sizes */}
        <div className="overflow-y-auto flex-1 max-h-[calc(90vh-80px)] space-y-4">
          <div className="overflow-x-auto w-full border border-zinc-800 rounded-xl bg-zinc-900/40 shadow-inner">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/90 text-zinc-400 font-mono text-[11px] uppercase tracking-wider font-bold">
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
                {eventList.map((ev, idx) => {
                  const orderDisplayId = ev.orderId || ev.rawOrder?.order_id || ev.rawLead?.lead_id || '—';
                  const custName = ev.customerName || ev.rawOrder?.customer_name || ev.rawLead?.customer_name || '—';
                  const evType = ev.rawEvent?.event_type || ev.rawOrder?.event_type || ev.eventName || 'Event';
                  const repDate = getReportingDate(ev);
                  const repTime = getReportingTime(ev);
                  const locationVal = getLocation(ev);
                  const assignedRole = getAssignedRole(ev);
                  const eqList = getEquipmentDetails(ev);
                  const status = ev.currentStatus || ev.rawOrder?.current_stage || ev.rawLead?.status || 'Confirmed';

                  return (
                    <tr key={`dt_${ev.id || idx}`} className="bg-zinc-950/20 hover:bg-zinc-900/30 transition-colors select-text">
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
                            {eqList.map((eq, i) => (
                              <div key={i} className="break-words">{eq}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic text-xs">No equipment assigned</span>
                        )}
                      </td>

                      {/* 9. Status */}
                      <td className="p-3.5 align-middle text-left whitespace-nowrap min-w-[160px]">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wide bg-zinc-850 text-amber-300 border border-zinc-700 leading-none whitespace-nowrap shadow-sm">
                          {status}
                        </span>
                      </td>

                      {/* 10. Actions */}
                      <td className="p-3.5 pr-4 align-middle text-center whitespace-nowrap min-w-[130px]">
                        <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                          <AssignedStaffDropdown 
                            orderId={ev.rawOrder?.order_id || ev.orderId || ev.rawLead?.lead_id || ev.leadId} 
                            leadId={ev.rawLead?.lead_id || ev.leadId || ev.rawOrder?.lead_id} 
                            order={ev.rawOrder} 
                            lead={ev.rawLead} 
                            productionItem={ev.rawProd} 
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-2 flex items-center justify-end shrink-0 border-t border-zinc-850">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};


