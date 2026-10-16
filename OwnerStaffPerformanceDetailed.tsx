import React, { useState, useMemo } from 'react';
import { useRole } from '../../RoleContext';
import { 
  Users, Award, Briefcase, Activity, Filter, CheckCircle2, AlertCircle, 
  Search, ChevronLeft, ChevronRight, ArrowUpDown, Calendar, X, TrendingUp, 
  DollarSign, FileText, PhoneCall, UserCheck, BarChart3, PieChart as PieChartIcon, 
  Layers, Clock, Sparkles, Trophy, Target, CheckSquare, ArrowRight, ChevronDown, Eye, Check
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, 
  Cell, CartesianGrid, PieChart, Pie 
} from 'recharts';
import { DateFilterInput } from '../../ui/DateFilterInput';

export const OwnerStaffPerformanceDetailed: React.FC = () => {
  const { 
    staff, productionStaff, users, leads, orders, production, 
    staffAssignments, operations, leadStaffAssignmentHistory, editorAssignments, isDataLoading 
  } = useRole();

  // Active Tab State: 'sales' | 'operations' | 'production'
  const [activeTab, setActiveTab] = useState<'sales' | 'operations' | 'production'>('sales');

  // Filters
  const [quickDateFilter, setQuickDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('All');
  const [staffTypeFilter, setStaffTypeFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'conversionRate', direction: 'desc' });
  const [showFilters, setShowFilters] = useState(false);

  // Staff Detail Modal State
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<{
    staffName: string;
    staffType: string;
    department: string;
    totalAssigned: number;
    completed: number;
    inProgress: number;
    pending: number;
    completionRate: number;
    avgCompletionTime: string;
    tasks: Array<{
      orderId: string;
      customerName: string;
      eventName: string;
      taskDeliverable: string;
      assignedDate: string;
      targetDate: string;
      completedDate: string;
      currentStatus: string;
    }>;
  } | null>(null);

  // Unified Pipeline calculation matching BusinessOwnerDashboard
  const unifiedPipeline = useMemo(() => {
    const itemMap = new Map<string, any>();

    (leads || []).forEach((lead: any) => {
      const key = lead.lead_id || lead.id || lead.order_id;
      if (!key) return;
      const status = lead.status || lead.current_status || 'New Lead';
      itemMap.set(key, {
        id: key,
        lead_id: lead.lead_id || key,
        order_id: lead.order_id || null,
        customer_name: lead.customer_name || 'N/A',
        event_name: lead.events?.[0]?.event_name || lead.event_type || 'Event',
        event_date: lead.event_date || lead.events?.[0]?.event_date || null,
        created_at: lead.created_at || lead.created_date || null,
        quotation_amount: lead.quotation_amount || lead.grand_total || 0,
        sales_person: lead.sales_person || lead.created_by || 'Unassigned',
        sales_status: status,
        ops_status: null,
        prod_status: null,
        isClosed: status === 'Order Closed' || status === 'Closed',
        hasEnteredSales: true,
        hasEnteredOps: false,
        hasEnteredProd: false,
        hasEnteredAcceptance: false,
        rawLead: lead
      });
    });

    (orders || []).forEach((order: any) => {
      const key = order.lead_id || order.order_id || order.id;
      if (!key) return;
      const existing = itemMap.get(key) || {
        id: key,
        lead_id: order.lead_id || key,
        order_id: order.order_id || key,
        customer_name: order.customer_name || 'N/A',
        event_name: order.custom_event_name || order.event_type || 'Event',
        event_date: order.event_date || null,
        created_at: order.created_at || null,
        quotation_amount: order.quotation_amount || order.grand_total || 0,
        sales_person: order.sales_person || 'Unassigned',
        sales_status: 'Order Confirmed',
        ops_status: null,
        prod_status: null,
        isClosed: order.current_stage === 'Order Closed' || order.current_stage === 'Closed',
        hasEnteredSales: true,
        hasEnteredOps: false,
        hasEnteredProd: false,
        hasEnteredAcceptance: false
      };

      existing.order_id = order.order_id || existing.order_id;
      existing.customer_name = order.customer_name || existing.customer_name;
      existing.quotation_amount = order.quotation_amount || order.grand_total || existing.quotation_amount;
      if (order.current_stage === 'Order Closed' || order.current_stage === 'Closed') {
        existing.isClosed = true;
      }
      existing.rawOrder = order;
      itemMap.set(key, existing);
    });

    (operations || []).forEach((ops: any) => {
      const key = ops.tracking_id || ops.order_id || ops.lead_id || ops.id;
      if (!key) return;
      let existing = itemMap.get(key);
      if (!existing) {
        for (const [k, val] of itemMap.entries()) {
          if ((ops.order_id && val.order_id === ops.order_id) || (ops.lead_id && val.lead_id === ops.lead_id)) {
            existing = val;
            break;
          }
        }
      }

      const opsStatus = ops.event_status || ops.status || ops.ops_status || 'Pending Allocation';

      if (existing) {
        existing.ops_status = opsStatus;
        existing.hasEnteredOps = true;
        existing.assigned_crew = ops.photographers || ops.videographers || ops.crew_assigned || existing.assigned_crew || 'Assigned';
        if (opsStatus === 'Order Closed' || opsStatus === 'Closed') existing.isClosed = true;
        existing.rawOps = ops;
      } else {
        itemMap.set(key, {
          id: key,
          lead_id: ops.lead_id || key,
          order_id: ops.order_id || key,
          customer_name: ops.customer_name || 'N/A',
          event_name: ops.event_name || ops.event_type || 'Event Shoot',
          event_date: ops.event_date || null,
          created_at: ops.created_at || null,
          quotation_amount: 0,
          sales_person: 'N/A',
          sales_status: 'Order Confirmed',
          ops_status: opsStatus,
          prod_status: null,
          isClosed: opsStatus === 'Order Closed' || opsStatus === 'Closed',
          hasEnteredSales: true,
          hasEnteredOps: true,
          hasEnteredProd: false,
          hasEnteredAcceptance: false,
          assigned_crew: ops.photographers || ops.videographers || 'Assigned',
          rawOps: ops
        });
      }
    });

    (production || []).forEach((prod: any) => {
      const key = prod.tracking_id || prod.order_id || prod.lead_id || prod.id;
      if (!key) return;
      let existing = itemMap.get(key);
      if (!existing) {
        for (const [k, val] of itemMap.entries()) {
          if ((prod.order_id && val.order_id === prod.order_id) || (prod.lead_id && val.lead_id === prod.lead_id)) {
            existing = val;
            break;
          }
        }
      }

      const prodStatus = prod.editing_status || prod.production_status || prod.status || 'Raw Footage Ingest';
      const isAcceptance = prodStatus === 'Client Acceptance' || prod.status === 'Client Acceptance';

      if (existing) {
        existing.prod_status = prodStatus;
        existing.hasEnteredProd = true;
        if (isAcceptance) existing.hasEnteredAcceptance = true;
        if (prodStatus === 'Order Closed' || prodStatus === 'Closed') existing.isClosed = true;
        existing.assigned_editor = prod.assigned_editor || prod.editor_name || existing.assigned_editor || 'Assigned Editor';
        existing.rawProd = prod;
      } else {
        itemMap.set(key, {
          id: key,
          lead_id: prod.lead_id || key,
          order_id: prod.order_id || key,
          customer_name: prod.customer_name || 'N/A',
          event_name: prod.event_name || prod.project_name || 'Editing Project',
          event_date: prod.event_date || null,
          created_at: prod.created_at || null,
          quotation_amount: 0,
          sales_person: 'N/A',
          sales_status: 'Order Confirmed',
          ops_status: 'Completed',
          prod_status: prodStatus,
          isClosed: prodStatus === 'Order Closed' || prodStatus === 'Closed',
          hasEnteredSales: true,
          hasEnteredOps: true,
          hasEnteredProd: true,
          hasEnteredAcceptance: isAcceptance,
          assigned_editor: prod.assigned_editor || 'Assigned Editor',
          rawProd: prod
        });
      }
    });

    return Array.from(itemMap.values());
  }, [leads, orders, operations, production]);

  const boCardsData = useMemo(() => {
    const salesTotalLeads = unifiedPipeline.filter(i => i.hasEnteredSales);
    const salesConverted = salesTotalLeads.filter(i => (i.sales_status || '').toLowerCase().includes('confirm') || i.order_id);
    const salesLost = salesTotalLeads.filter(i => (i.sales_status || '').toLowerCase().includes('lost'));
    const salesFollowup = salesTotalLeads.filter(i => (i.sales_status || '').toLowerCase().includes('quotation'));

    const opsAll = unifiedPipeline.filter(i => i.hasEnteredOps);
    const opsNew = opsAll.filter(i => (i.ops_status || '').toLowerCase().includes('pending') || (i.ops_status || '').toLowerCase().includes('assigned') || (i.ops_status || '').toLowerCase() === 'not started');
    const opsCompleted = opsAll.filter(i => (i.ops_status || '').toLowerCase().includes('complete') || (i.ops_status || '').toLowerCase().includes('delivered'));
    const opsUpcoming = opsAll.filter(i => i.event_date && new Date(i.event_date) >= new Date() && !(i.ops_status || '').toLowerCase().includes('complete'));
    const opsScheduled = opsAll.filter(i => (i.ops_status || '').toLowerCase().includes('scheduled') || i.assigned_crew !== 'Unassigned');

    const prodAll = unifiedPipeline.filter(i => i.hasEnteredProd);
    const prodNew = prodAll.filter(i => (i.prod_status || '').toLowerCase().includes('raw') || (i.prod_status || '').toLowerCase().includes('new') || i.prod_status === 'Not Started');
    const prodInProgress = prodAll.filter(i => {
      const editingStatus = (i.editing_status || '').toLowerCase().trim();
      const prodStatus = (i.prod_status || '').toLowerCase().trim();
      return (
        editingStatus === 'editing started' ||
        editingStatus === 'customer review' ||
        prodStatus === 'editing started' ||
        prodStatus === 'customer review'
      );
    });
    const prodEditingCompleted = prodAll.filter(i => (i.prod_status || '').toLowerCase().includes('complete') || (i.prod_status || '').toLowerCase().includes('proof'));
    const prodClientAcceptance = unifiedPipeline.filter(i => i.hasEnteredAcceptance);

    return {
      salesTotalLeads, salesConverted, salesLost, salesFollowup,
      opsNew, opsCompleted, opsUpcoming, opsScheduled, opsAll,
      prodNew, prodInProgress, prodEditingCompleted, prodClientAcceptance, prodAll
    };
  }, [unifiedPipeline]);

  // Quick Date Range Handler
  const handleQuickDateChange = (type: 'all' | 'today' | 'week' | 'month' | 'last_month' | 'custom') => {
    setQuickDateFilter(type);
    setCurrentPage(1);

    if (type === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    const now = new Date();
    const formatYMD = (d: Date) => d.toISOString().split('T')[0];

    if (type === 'today') {
      const todayStr = formatYMD(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (type === 'week') {
      const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
      const lastDay = new Date();
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
    } else if (type === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
    } else if (type === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
    }
  };

  // Helper function to check if date is within range
  const isWithinDateRange = (dateStr?: string | null) => {
    if (!startDate && !endDate) return true;
    if (!dateStr || dateStr === 'N/A') return true;

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;

    if (startDate) {
      const sd = new Date(startDate);
      sd.setHours(0, 0, 0, 0);
      if (d < sd) return false;
    }
    if (endDate) {
      const ed = new Date(endDate);
      ed.setHours(23, 59, 59, 999);
      if (d > ed) return false;
    }
    return true;
  };

  // ----------------------------------------------------
  // DATA CALCULATION: SALES PERFORMANCE
  // ----------------------------------------------------
  const salesData = useMemo(() => {
    const salesUsers = (users || []).filter(u => u.role === 'Sales Team');

    // Filter leads by date range
    const filteredLeads = (leads || []).filter(l => isWithinDateRange(l.created_date || l.created_at || (l as any).updated_at));

    const staffRows = salesUsers.map(user => {
      const nameLower = user.name.toLowerCase();
      const fullNameLower = (user.full_name || '').toLowerCase();

      const staffLeads = filteredLeads.filter(l => {
        const sp = (l.sales_person || '').toLowerCase();
        const cb = (l.created_by || '').toLowerCase();
        return sp === nameLower || sp === fullNameLower || cb === nameLower || cb === fullNameLower;
      });

      let newLeadsCount = 0;
      let followUpsCount = 0;
      let quotationsCount = 0;
      let confirmedOrdersCount = 0;
      let lostLeadsCount = 0;
      let totalQuotationValue = 0;
      let totalRevenue = 0;

      const tasksForModal: Array<any> = [];

      staffLeads.forEach(lead => {
        const status = (lead.current_status || lead.status || '').trim();
        const sLower = status.toLowerCase();

        // Amount calculations
        const qVal = Number(lead.quotation_amount || lead.grand_total || lead.final_total || 0);
        
        // Find matching confirmed order if present
        const matchingOrder = (orders || []).find(o => o.lead_id === lead.lead_id || o.order_id === lead.lead_id);
        const orderRev = matchingOrder ? Number(matchingOrder.grand_total || matchingOrder.final_amount || qVal) : qVal;

        if (sLower.includes('new lead') || sLower.includes('contacted') || sLower.includes('created quotation')) {
          newLeadsCount++;
        }
        
        if (sLower.includes('follow') || sLower.includes('negotiation') || lead.next_follow_up_date) {
          followUpsCount++;
        }

        if (sLower.includes('quote') || sLower.includes('quotation') || qVal > 0) {
          quotationsCount++;
          totalQuotationValue += qVal;
        }

        if (sLower.includes('confirm') || sLower.includes('order confirmed') || matchingOrder) {
          confirmedOrdersCount++;
          totalRevenue += orderRev;
        } else if (sLower.includes('lost')) {
          lostLeadsCount++;
        }

        // Event name
        let eventName = 'General Lead';
        if (lead.events && lead.events.length > 0) {
          eventName = lead.events.map((e: any) => e.event_name || e.event_type).join(', ');
        }

        tasksForModal.push({
          orderId: lead.lead_id,
          customerName: lead.customer_name || 'N/A',
          eventName,
          taskDeliverable: 'Sales Processing & Conversion',
          assignedDate: lead.created_date || lead.created_at || 'N/A',
          targetDate: lead.delivery_target_date || lead.event_date || 'N/A',
          completedDate: matchingOrder ? (matchingOrder.order_date || 'Confirmed') : (sLower.includes('lost') ? 'Closed' : 'N/A'),
          currentStatus: status || 'New Lead'
        });
      });

      const totalLeads = staffLeads.length;
      const conversionRate = totalLeads > 0 ? Math.round((confirmedOrdersCount / totalLeads) * 100) : 0;

      return {
        staff_id: user.id,
        salesStaff: user.full_name || user.name,
        staffType: 'In House',
        department: 'Sales',
        leads: totalLeads,
        newLeads: newLeadsCount,
        followUps: followUpsCount,
        quotations: quotationsCount,
        ordersConfirmed: confirmedOrdersCount,
        lost: lostLeadsCount,
        conversionRate,
        quotationValue: totalQuotationValue,
        revenue: totalRevenue,
        avgCompletionTime: '1.5 Days',
        tasks: tasksForModal
      };
    });

    // Summary totals
    const totalSalesStaff = staffRows.length;
    const totalLeads = staffRows.reduce((acc, r) => acc + r.leads, 0);
    const totalNewLeads = staffRows.reduce((acc, r) => acc + r.newLeads, 0);
    const totalFollowUps = staffRows.reduce((acc, r) => acc + r.followUps, 0);
    const totalQuotations = staffRows.reduce((acc, r) => acc + r.quotations, 0);
    const totalOrdersConfirmed = staffRows.reduce((acc, r) => acc + r.ordersConfirmed, 0);
    const totalLost = staffRows.reduce((acc, r) => acc + r.lost, 0);
    const grandQuotationValue = staffRows.reduce((acc, r) => acc + r.quotationValue, 0);
    const grandRevenue = staffRows.reduce((acc, r) => acc + r.revenue, 0);
    const overallConversionRate = totalLeads > 0 ? Math.round((totalOrdersConfirmed / totalLeads) * 100) : 0;

    // Rankings (Top 3)
    const rankedSales = [...staffRows].sort((a, b) => {
      if (b.conversionRate !== a.conversionRate) return b.conversionRate - a.conversionRate;
      if (b.ordersConfirmed !== a.ordersConfirmed) return b.ordersConfirmed - a.ordersConfirmed;
      return b.revenue - a.revenue;
    });

    return {
      rows: staffRows,
      summary: {
        totalSalesStaff,
        totalLeads,
        totalNewLeads,
        totalFollowUps,
        totalQuotations,
        totalOrdersConfirmed,
        totalLost,
        grandQuotationValue,
        grandRevenue,
        overallConversionRate,
        avgCompletionTime: '1.8 Days'
      },
      rankings: rankedSales
    };
  }, [users, leads, orders, startDate, endDate]);

  // ----------------------------------------------------
  // DATA CALCULATION: OPERATIONS STAFF PERFORMANCE
  // ----------------------------------------------------
  const opsData = useMemo(() => {
    // 1. Identify Operations / Field Crew staff members
    const opsStaffList = (staff || []).filter(s => {
      const dept = (s.department || '').toLowerCase().trim();
      const role = (s.role || '').toLowerCase().trim();
      return dept.includes('operation') || dept.includes('field') || dept.includes('crew') || dept === 'operations' ||
             role.includes('photographer') || role.includes('videographer') || role.includes('drone') || role.includes('assistant') || role.includes('crew');
    });

    const targetStaff = opsStaffList.length > 0 ? opsStaffList : (staff || []);

    const staffRows = targetStaff.map(member => {
      const memberNameLower = (member.name || '').toLowerCase().trim();
      const memberFullNameLower = ((member as any).full_name || '').toLowerCase().trim();
      const memberId = member.staff_id;

      // Collection of all task/event assignment records for this staff member
      const memberTasks: Array<{
        orderId: string;
        customerName: string;
        eventName: string;
        taskDeliverable: string;
        assignedDate: string;
        targetDate: string;
        completedDate: string;
        currentStatus: string;
        isStarted: boolean;
        isCompleted: boolean;
      }> = [];

      const processedKeys = new Set<string>();

      // -------------------------------------------------
      // SOURCE A: staffAssignments (explicit staff assignment records)
      // -------------------------------------------------
      (staffAssignments || []).forEach(sa => {
        const saNameLower = (sa.staff_name || '').toLowerCase().trim();
        const matchesStaff = (sa.staff_id && sa.staff_id === memberId) ||
          (saNameLower && (saNameLower === memberNameLower || saNameLower === memberFullNameLower));

        if (!matchesStaff) return;

        const order = (orders || []).find(o => o.order_id === sa.order_id);
        const lead = (leads || []).find(l => l.lead_id === sa.order_id || l.lead_id === order?.lead_id);
        const op = (operations || []).find(o => o.order_id === sa.order_id);

        const assignedDate = sa.assignment_date || (sa as any).assigned_at || op?.event_date || order?.event_date || (lead as any)?.created_at || 'N/A';

        if (!isWithinDateRange(assignedDate)) return;

        const rawStatus = sa.assignment_status || sa.status || op?.event_status || order?.current_stage || lead?.current_status || lead?.status || 'Assigned';
        const st = rawStatus.toLowerCase().trim();

        // Check workflow completion
        const isCompleted = [
          'completed', 'event completed', 'event ended', 'footage handover',
          'verified footage', 'footage handover verified', 'raw footage received',
          'delivered', 'approved', 'final', 'project completed', 'closed'
        ].some(term => st.includes(term));

        // Check workflow started
        const isStarted = isCompleted || [
          'event started', 'started', 'in progress', 'in-progress',
          'ongoing', 'shooting', 'assigned crew', 'crew assigned'
        ].some(term => st.includes(term));

        const roleName = sa.staff_role || member.role || 'Crew';
        const uniqueKey = `sa-${sa.assignment_id || `${sa.order_id}-${roleName}`}`;

        if (!processedKeys.has(uniqueKey)) {
          processedKeys.add(uniqueKey);
          memberTasks.push({
            orderId: sa.order_id || 'N/A',
            customerName: order?.customer_name || lead?.customer_name || 'N/A',
            eventName: (sa as any).event_name || order?.package_name || op?.event_type || 'Event Task',
            taskDeliverable: roleName,
            assignedDate: assignedDate !== 'N/A' ? assignedDate : (order?.event_date || 'N/A'),
            targetDate: op?.event_date || order?.event_date || 'N/A',
            completedDate: isCompleted ? (op?.event_date || order?.event_date || 'Completed') : 'N/A',
            currentStatus: rawStatus,
            isStarted,
            isCompleted
          });
        }
      });

      // -------------------------------------------------
      // SOURCE B: Sub-events in leads (lead.events)
      // -------------------------------------------------
      (leads || []).forEach(lead => {
        const order = (orders || []).find(o => o.lead_id === lead.lead_id);
        const op = (operations || []).find(o => o.order_id === (order?.order_id || lead.lead_id));

        if (lead.events && Array.isArray(lead.events) && lead.events.length > 0) {
          lead.events.forEach(ev => {
            const assignedNames = ev.assigned_staff_names 
              ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase()) 
              : [];
            const assignedStaffRaw = (ev.assigned_staff || '').toLowerCase();

            const isAssigned = assignedNames.includes(memberNameLower) ||
              (memberFullNameLower && assignedNames.includes(memberFullNameLower)) ||
              assignedStaffRaw.includes(memberNameLower);

            if (!isAssigned) return;

            const assignedDate = ev.reporting_date || ev.event_date || op?.event_date || order?.event_date || (lead as any)?.created_at || 'N/A';
            if (!isWithinDateRange(assignedDate)) return;

            const rawStatus = ev.status || ev.event_status || op?.event_status || order?.current_stage || lead.current_status || lead.status || 'Assigned';
            const st = rawStatus.toLowerCase().trim();

            const isCompleted = [
              'completed', 'event completed', 'event ended', 'footage handover',
              'verified footage', 'footage handover verified', 'raw footage received',
              'delivered', 'approved', 'final', 'project completed', 'closed'
            ].some(term => st.includes(term));

            const isStarted = isCompleted || [
              'event started', 'started', 'in progress', 'in-progress',
              'ongoing', 'shooting', 'assigned crew', 'crew assigned'
            ].some(term => st.includes(term));

            const orderIdVal = order?.order_id || lead.lead_id || 'N/A';
            const eventNameVal = ev.event_name || ev.event_type || 'Event Shoot';
            const uniqueKey = `ev-${orderIdVal}-${ev.id || eventNameVal}-${memberNameLower}`;

            if (!processedKeys.has(uniqueKey)) {
              processedKeys.add(uniqueKey);
              memberTasks.push({
                orderId: orderIdVal,
                customerName: order?.customer_name || lead.customer_name || 'N/A',
                eventName: eventNameVal,
                taskDeliverable: member.role || 'Crew',
                assignedDate: assignedDate !== 'N/A' ? assignedDate : (order?.event_date || 'N/A'),
                targetDate: ev.event_date || op?.event_date || order?.event_date || 'N/A',
                completedDate: isCompleted ? (ev.event_date || op?.event_date || order?.event_date || 'Completed') : 'N/A',
                currentStatus: rawStatus,
                isStarted,
                isCompleted
              });
            }
          });
        }
      });

      // -------------------------------------------------
      // SOURCE C: operations table (photographer_assigned, etc.)
      // -------------------------------------------------
      (operations || []).forEach(op => {
        const order = (orders || []).find(o => o.order_id === op.order_id);
        const lead = (leads || []).find(l => l.lead_id === op.order_id || l.lead_id === order?.lead_id);

        const matchedRoles: string[] = [];

        if (op.photographer_assigned && (op.photographer_assigned.toLowerCase().includes(memberNameLower) || (memberFullNameLower && op.photographer_assigned.toLowerCase().includes(memberFullNameLower)))) {
          matchedRoles.push('Photographer');
        }
        if (op.videographer_assigned && (op.videographer_assigned.toLowerCase().includes(memberNameLower) || (memberFullNameLower && op.videographer_assigned.toLowerCase().includes(memberFullNameLower)))) {
          matchedRoles.push('Videographer');
        }
        if (op.drone_operator_assigned && (op.drone_operator_assigned.toLowerCase().includes(memberNameLower) || (memberFullNameLower && op.drone_operator_assigned.toLowerCase().includes(memberFullNameLower)))) {
          matchedRoles.push('Drone Operator');
        }
        if (op.assistant_assigned && (op.assistant_assigned.toLowerCase().includes(memberNameLower) || (memberFullNameLower && op.assistant_assigned.toLowerCase().includes(memberFullNameLower)))) {
          matchedRoles.push('Assistant');
        }

        if (matchedRoles.length === 0) return;

        const assignedDate = op.event_date || order?.event_date || (lead as any)?.created_at || 'N/A';
        if (!isWithinDateRange(assignedDate)) return;

        const rawStatus = op.event_status || order?.current_stage || lead?.current_status || lead?.status || 'Assigned';
        const st = rawStatus.toLowerCase().trim();

        const isCompleted = [
          'completed', 'event completed', 'event ended', 'footage handover',
          'verified footage', 'footage handover verified', 'raw footage received',
          'delivered', 'approved', 'final', 'project completed', 'closed'
        ].some(term => st.includes(term));

        const isStarted = isCompleted || [
          'event started', 'started', 'in progress', 'in-progress',
          'ongoing', 'shooting', 'assigned crew', 'crew assigned'
        ].some(term => st.includes(term));

        matchedRoles.forEach(roleName => {
          const uniqueKey = `op-${op.operation_id || op.order_id}-${roleName}-${memberNameLower}`;
          if (!processedKeys.has(uniqueKey)) {
            processedKeys.add(uniqueKey);
            memberTasks.push({
              orderId: op.order_id || 'N/A',
              customerName: order?.customer_name || lead?.customer_name || 'N/A',
              eventName: order?.package_name || op.event_type || 'Field Shoot',
              taskDeliverable: roleName,
              assignedDate: assignedDate !== 'N/A' ? assignedDate : (order?.event_date || 'N/A'),
              targetDate: op.event_date || order?.event_date || 'N/A',
              completedDate: isCompleted ? (op.event_date || order?.event_date || 'Completed') : 'N/A',
              currentStatus: rawStatus,
              isStarted,
              isCompleted
            });
          }
        });
      });

      // Calculate performance metrics from ALL collected member tasks
      const totalAssigned = memberTasks.length;
      const eventsCompletedCount = memberTasks.filter(t => t.isCompleted).length;
      const eventsStartedCount = memberTasks.filter(t => t.isStarted || t.isCompleted).length;
      const pendingCount = Math.max(0, totalAssigned - eventsCompletedCount);
      const completionRate = totalAssigned > 0 ? Math.round((eventsCompletedCount / totalAssigned) * 100) : 0;

      const sType = (member.staff_type || (member as any).Staff_Type || 'In House').replace('-', ' ');

      return {
        staff_id: member.staff_id,
        operationsStaff: member.name,
        staffType: sType,
        department: 'Operations',
        eventsAssigned: totalAssigned,
        eventsStarted: eventsStartedCount,
        eventsCompleted: eventsCompletedCount,
        pending: pendingCount,
        completionRate,
        avgCompletionTime: '1.2 Days',
        tasks: memberTasks.map(({ isStarted, isCompleted, ...t }) => t)
      };
    });

    const totalOpsStaff = staffRows.length;
    const totalEventsAssigned = staffRows.reduce((acc, r) => acc + r.eventsAssigned, 0);
    const totalEventsStarted = staffRows.reduce((acc, r) => acc + r.eventsStarted, 0);
    const totalEventsCompleted = staffRows.reduce((acc, r) => acc + r.eventsCompleted, 0);
    const totalPending = Math.max(0, totalEventsAssigned - totalEventsCompleted);
    const overallCompletionRate = totalEventsAssigned > 0 ? Math.round((totalEventsCompleted / totalEventsAssigned) * 100) : 0;

    const rankedOps = [...staffRows].sort((a, b) => {
      if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
      return b.eventsCompleted - a.eventsCompleted;
    });

    return {
      rows: staffRows,
      summary: {
        totalOpsStaff,
        totalEventsAssigned,
        totalEventsStarted,
        totalEventsCompleted,
        totalPending,
        overallCompletionRate,
        avgCompletionTime: '1.2 Days'
      },
      rankings: rankedOps
    };
  }, [staff, staffAssignments, operations, orders, leads, startDate, endDate]);

  // ----------------------------------------------------
  // DATA CALCULATION: PRODUCTION STAFF PERFORMANCE
  // ----------------------------------------------------
  const prodData = useMemo(() => {
    const editorsList = productionStaff || [];

    const filteredEditorAssignments = (editorAssignments || []).filter(a => isWithinDateRange(a.assigned_date || a.target_finish_date));

    const staffRows = editorsList.map(member => {
      const memberAssignments = filteredEditorAssignments.filter(a => 
        a.staff_id === member.staff_id || 
        (a.staff_name || '').toLowerCase() === member.name.toLowerCase()
      );

      let editingStartedCount = 0;
      let customerReviewCount = 0;
      let editingCompletedCount = 0;
      let clientAcceptanceCount = 0;
      let completedDeliverablesCount = 0;
      let pendingDeliverablesCount = 0;

      const tasksForModal: Array<any> = [];

      memberAssignments.forEach(a => {
        const st = (a.status || '').toLowerCase();
        const prodItem = (production || []).find(p => p.production_id === a.production_id || p.tracking_id === a.production_id);
        const order = (orders || []).find(o => o.order_id === a.order_id || o.order_id === prodItem?.order_id);

        if (st.includes('approval') || st.includes('client acceptance') || st.includes('accepted') || st.includes('approved')) {
          clientAcceptanceCount++;
          completedDeliverablesCount++;
        } else if (st.includes('editing completed') || st.includes('completed')) {
          editingCompletedCount++;
          completedDeliverablesCount++;
        } else if (st.includes('customer review') || st.includes('client review') || st.includes('sent')) {
          customerReviewCount++;
        } else if (st.includes('editing started') || st.includes('progress') || st.includes('started')) {
          editingStartedCount++;
        } else {
          pendingDeliverablesCount++;
        }

        tasksForModal.push({
          orderId: a.order_id || a.production_id || 'N/A',
          customerName: order?.customer_name || 'N/A',
          eventName: a.event_name || 'Production Project',
          taskDeliverable: a.speciality || a.deliverable || 'Video Editing',
          assignedDate: a.assigned_date || 'N/A',
          targetDate: a.target_finish_date || 'N/A',
          completedDate: (st.includes('completed') || st.includes('accepted')) ? (a.completed_date || 'Done') : 'N/A',
          currentStatus: a.status || 'Assigned'
        });
      });

      const totalAssigned = memberAssignments.length;
      const completionRate = totalAssigned > 0 ? Math.round((completedDeliverablesCount / totalAssigned) * 100) : 0;
      const sType = (member.staff_type || (member as any).Staff_Type || 'In House').replace('-', ' ');

      return {
        staff_id: member.staff_id,
        productionStaff: member.name,
        staffType: sType,
        department: 'Production',
        deliverablesAssigned: totalAssigned,
        editingStarted: editingStartedCount,
        customerReview: customerReviewCount,
        editingCompleted: editingCompletedCount,
        clientAcceptance: clientAcceptanceCount,
        completed: completedDeliverablesCount,
        pending: pendingDeliverablesCount,
        completionRate,
        avgCompletionTime: '2.4 Days',
        tasks: tasksForModal
      };
    });

    const totalProdStaff = staffRows.length;
    const totalDeliverablesAssigned = staffRows.reduce((acc, r) => acc + r.deliverablesAssigned, 0);
    const totalEditingStarted = staffRows.reduce((acc, r) => acc + r.editingStarted, 0);
    const totalCustomerReview = staffRows.reduce((acc, r) => acc + r.customerReview, 0);
    const totalEditingCompleted = staffRows.reduce((acc, r) => acc + r.editingCompleted, 0);
    const totalClientAcceptance = staffRows.reduce((acc, r) => acc + r.clientAcceptance, 0);
    const totalCompletedDeliverables = staffRows.reduce((acc, r) => acc + r.completed, 0);
    const totalPendingDeliverables = staffRows.reduce((acc, r) => acc + r.pending, 0);
    const overallCompletionRate = totalDeliverablesAssigned > 0 ? Math.round((totalCompletedDeliverables / totalDeliverablesAssigned) * 100) : 0;

    const rankedProd = [...staffRows].sort((a, b) => {
      if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
      return b.completed - a.completed;
    });

    return {
      rows: staffRows,
      summary: {
        totalProdStaff,
        totalDeliverablesAssigned,
        totalEditingStarted,
        totalCustomerReview,
        totalEditingCompleted,
        totalClientAcceptance,
        totalCompletedDeliverables,
        totalPendingDeliverables,
        overallCompletionRate,
        avgCompletionTime: '2.4 Days'
      },
      rankings: rankedProd
    };
  }, [productionStaff, editorAssignments, production, orders, startDate, endDate]);

  // ----------------------------------------------------
  // FILTERING AND SORTING FOR ACTIVE TAB TABLE
  // ----------------------------------------------------
  const currentActiveTabRows = useMemo(() => {
    let rows: any[] = [];
    if (activeTab === 'sales') rows = salesData.rows;
    else if (activeTab === 'operations') rows = opsData.rows;
    else if (activeTab === 'production') rows = prodData.rows;

    let filtered = rows.filter(row => {
      // Staff Filter
      if (selectedStaffFilter !== 'All') {
        const name = row.salesStaff || row.operationsStaff || row.productionStaff || '';
        if (name !== selectedStaffFilter) return false;
      }

      // Staff Type Filter
      if (staffTypeFilter !== 'All') {
        const st = (row.staffType || '').toLowerCase();
        const filterVal = staffTypeFilter.toLowerCase();
        if (filterVal === 'in house' && !st.includes('house')) return false;
        if (filterVal === 'freelancer' && !st.includes('free')) return false;
      }

      // Search Query
      if (searchQuery) {
        const name = (row.salesStaff || row.operationsStaff || row.productionStaff || '').toLowerCase();
        if (!name.includes(searchQuery.toLowerCase())) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal === undefined) aVal = 0;
      if (bVal === undefined) bVal = 0;

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [activeTab, salesData, opsData, prodData, selectedStaffFilter, staffTypeFilter, searchQuery, sortConfig]);

  const totalPages = Math.ceil(currentActiveTabRows.length / itemsPerPage);
  const paginatedRows = currentActiveTabRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Staff options for staff filter dropdown based on active tab
  const staffFilterOptions = useMemo(() => {
    if (activeTab === 'sales') {
      return salesData.rows.map(r => r.salesStaff);
    } else if (activeTab === 'operations') {
      return opsData.rows.map(r => r.operationsStaff);
    } else {
      return prodData.rows.map(r => r.productionStaff);
    }
  }, [activeTab, salesData, opsData, prodData]);

  if (isDataLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500"></div>
        <p className="text-zinc-400 font-mono text-xs uppercase tracking-widest">Loading Performance Ecosystem...</p>
      </div>
    );
  }

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const SortHeader: React.FC<{ label: string, sortKey: string, align?: 'left' | 'center' | 'right' }> = ({ label, sortKey, align = 'left' }) => (
    <th 
      className={`p-3.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono cursor-pointer hover:text-amber-400 transition-colors text-${align}`}
      onClick={() => handleSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
        <span>{label}</span>
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      </div>
    </th>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      
      {/* ---------------------------------------------------- */}
      {/* TOP HEADER & GLOBAL CONTROLS                         */}
      {/* ---------------------------------------------------- */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-end gap-4 border-b border-zinc-900 pb-4">
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold font-mono text-white hover:bg-zinc-800 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>

        {/* GLOBAL FILTERS ROW */}
        {showFilters && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Quick Date Filters */}
          <div className="flex items-center gap-1.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-1 overflow-x-auto">
            <span className="text-[10px] font-mono text-zinc-500 px-2 uppercase tracking-wider font-bold">Date Range:</span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'custom', label: 'Custom' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => handleQuickDateChange(item.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                  quickDateFilter === item.id
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Date Range Inputs & Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {quickDateFilter === 'custom' && (
              <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="w-32">
                  <DateFilterInput 
                    value={startDate} 
                    onChange={val => { setStartDate(val); setCurrentPage(1); }}
                    className="bg-transparent text-zinc-200 text-xs font-mono outline-none"
                  />
                </div>
                <span className="text-zinc-600">-</span>
                <div className="w-32">
                  <DateFilterInput 
                    value={endDate} 
                    onChange={val => { setEndDate(val); setCurrentPage(1); }}
                    className="bg-transparent text-zinc-200 text-xs font-mono outline-none"
                  />
                </div>
              </div>
            )}

            {/* Dynamic Staff Filter */}
            <select
              value={selectedStaffFilter}
              onChange={e => { setSelectedStaffFilter(e.target.value); setCurrentPage(1); }}
              className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-500 font-mono cursor-pointer"
            >
              <option value="All">All {activeTab === 'sales' ? 'Sales' : activeTab === 'operations' ? 'Operations' : 'Production'} Staff</option>
              {staffFilterOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {/* Staff Type Filter */}
            <select
              value={staffTypeFilter}
              onChange={e => { setStaffTypeFilter(e.target.value); setCurrentPage(1); }}
              className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-amber-500 font-mono cursor-pointer"
            >
              <option value="All">All Staff Types</option>
              <option value="In House">In House</option>
              <option value="Freelancer">Freelancer</option>
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="bg-zinc-900 border border-zinc-800 focus:border-amber-500 text-white text-xs rounded-xl pl-8 pr-3 py-2 outline-none w-40 font-mono transition-all"
              />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* 16 & 17. HIGH-LEVEL WORKFLOW & ECOSYSTEM VISUALIZER   */}
      {/* ---------------------------------------------------- */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-900 pb-3 gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-300 font-mono">
              Business Performance Ecosystem Pipeline
            </h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">Live Database Flow Metrics</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Stage 1: Sales */}
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_sales' }))}
            className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-2 relative group hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px] font-mono uppercase">
              <span>1. Sales Team</span>
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-black text-white">{boCardsData.salesTotalLeads.length} Leads</div>
              <div className="text-[11px] font-mono text-amber-400">{boCardsData.salesConverted.length} Orders Confirmed ({boCardsData.salesTotalLeads.length > 0 ? Math.round((boCardsData.salesConverted.length / boCardsData.salesTotalLeads.length) * 100) : 0}%)</div>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono border-t border-zinc-800/60 pt-1.5 flex justify-between">
              <span>Rev: {formatCurrency(salesData.summary.grandRevenue)}</span>
            </div>
          </div>

          {/* Stage 2: Operations */}
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_ops' }))}
            className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-2 relative group hover:border-blue-500/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px] font-mono uppercase">
              <span>2. Operations</span>
              <Briefcase className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <div className="text-lg font-black text-white">{boCardsData.opsAll.length} Events</div>
              <div className="text-[11px] font-mono text-blue-400">{boCardsData.opsCompleted.length} Completed ({boCardsData.opsAll.length > 0 ? Math.round((boCardsData.opsCompleted.length / boCardsData.opsAll.length) * 100) : 0}%)</div>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono border-t border-zinc-800/60 pt-1.5 flex justify-between">
              <span>Pending: {boCardsData.opsUpcoming.length}</span>
            </div>
          </div>

          {/* Stage 3: Production */}
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_prod' }))}
            className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-2 relative group hover:border-purple-500/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px] font-mono uppercase">
              <span>3. Production</span>
              <Layers className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <div className="text-lg font-black text-white">{boCardsData.prodAll.length} Deliverables</div>
              <div className="text-[11px] font-mono text-purple-400">{boCardsData.prodEditingCompleted.length} Edited ({boCardsData.prodAll.length > 0 ? Math.round((boCardsData.prodEditingCompleted.length / boCardsData.prodAll.length) * 100) : 0}%)</div>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono border-t border-zinc-800/60 pt-1.5 flex justify-between">
              <span>In Review: {boCardsData.prodInProgress.length}</span>
            </div>
          </div>

          {/* Stage 4: Client Acceptance */}
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_acceptance' }))}
            className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-2 relative group hover:border-emerald-500/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px] font-mono uppercase">
              <span>4. Acceptance</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-black text-white">{boCardsData.prodClientAcceptance.length} Approved</div>
              <div className="text-[11px] font-mono text-emerald-400">Client Accepted</div>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono border-t border-zinc-800/60 pt-1.5 flex justify-between">
              <span>Pending: {boCardsData.prodAll.length - boCardsData.prodClientAcceptance.length}</span>
            </div>
          </div>

          {/* Stage 5: Orders Closed */}
          <div 
            onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_closed' }))}
            className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col justify-between space-y-2 relative group hover:border-emerald-500/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-zinc-400 text-[10px] font-mono uppercase">
              <span>5. Orders Closed</span>
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-black text-white">{unifiedPipeline.filter(i => i.isClosed).length} Orders</div>
              <div className="text-[11px] font-mono text-emerald-400">Pipeline Fulfilled</div>
            </div>
            <div className="text-[9px] text-zinc-500 font-mono border-t border-zinc-800/60 pt-1.5 flex justify-between">
              <span>Success Rate: 100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* DEPARTMENT / PERFORMANCE DROPDOWN (Directly below Pipeline) */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-amber-400" />
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-white font-mono">
              Department Performance View
            </h3>
            <p className="text-[11px] text-zinc-400 font-mono">
              Select department to review detailed staff scorecards, conversion metrics, and deliverable records.
            </p>
          </div>
        </div>
        <div className="w-full sm:w-72">
          <select
            value={activeTab}
            onChange={(e) => {
              const val = e.target.value as 'sales' | 'operations' | 'production';
              setActiveTab(val);
              setSelectedStaffFilter('All');
              setCurrentPage(1);
              setSortConfig({ key: val === 'sales' ? 'conversionRate' : 'completionRate', direction: 'desc' });
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-bold font-mono text-white focus:outline-none focus:border-amber-500 transition-colors shadow-inner cursor-pointer"
          >
            <option value="sales">Sales Performance</option>
            <option value="operations">Operations Performance</option>
            <option value="production">Production Performance</option>
          </select>
        </div>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: SALES PERFORMANCE                             */}
      {/* ==================================================== */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          {/* Summary Cards hidden per user request */}

          {/* Performance Ranking Header */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white font-mono">
                Sales Leaderboard & Performance Ranking
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {salesData.rankings.slice(0, 3).map((staff, idx) => {
                const medal = idx === 0 ? '🏆 1st Place' : idx === 1 ? '🥈 2nd Place' : '🥉 3rd Place';
                const borderColor = idx === 0 ? 'border-amber-500/50 bg-amber-500/10' : idx === 1 ? 'border-zinc-400/50 bg-zinc-400/10' : 'border-amber-700/50 bg-amber-800/10';
                return (
                  <div key={staff.staff_id} className={`p-4 rounded-xl border ${borderColor} flex items-center justify-between`}>
                    <div>
                      <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">{medal}</span>
                      <h4 className="text-sm font-black text-white mt-1">{staff.salesStaff}</h4>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                        {staff.ordersConfirmed} Orders ({staff.conversionRate}% Conv)
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-400 font-mono">{formatCurrency(staff.revenue)}</div>
                      <span className="text-[9px] text-zinc-500 font-mono">{staff.leads} Total Leads</span>
                    </div>
                  </div>
                );
              })}
              {salesData.rankings.length === 0 && (
                <p className="text-xs font-mono text-zinc-500 italic col-span-3">No sales team data available.</p>
              )}
            </div>
          </div>

          {/* Sales Performance Table */}
          <div className="bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">Sales Staff Performance Directory</h3>
              </div>
              <span className="text-xs text-zinc-500 font-mono">Click any row to view full lead details</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-900/40 border-b border-zinc-800">
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono text-center w-16 min-w-[64px] whitespace-nowrap">S.NO</th>
                    <SortHeader label="Sales Staff" sortKey="salesStaff" />
                    <SortHeader label="Leads" sortKey="leads" align="center" />
                    <SortHeader label="Follow-ups" sortKey="followUps" align="center" />
                    <SortHeader label="Quotations" sortKey="quotations" align="center" />
                    <SortHeader label="Orders Confirmed" sortKey="ordersConfirmed" align="center" />
                    <SortHeader label="Lost" sortKey="lost" align="center" />
                    <SortHeader label="Conversion Rate" sortKey="conversionRate" align="center" />
                    <SortHeader label="Quotation Value" sortKey="quotationValue" align="right" />
                    <SortHeader label="Revenue" sortKey="revenue" align="right" />
                    <th className="p-3.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {paginatedRows.map((staffItem, idx) => (
                    <tr 
                      key={staffItem.staff_id}
                      onClick={() => setSelectedStaffDetail({
                        staffName: staffItem.salesStaff,
                        staffType: staffItem.staffType,
                        department: 'Sales',
                        totalAssigned: staffItem.leads,
                        completed: staffItem.ordersConfirmed,
                        inProgress: staffItem.followUps,
                        pending: staffItem.newLeads,
                        completionRate: staffItem.conversionRate,
                        avgCompletionTime: staffItem.avgCompletionTime,
                        tasks: staffItem.tasks
                      })}
                      className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                    >
                      <td className="p-3 font-mono text-zinc-400 text-center text-xs font-bold w-16 min-w-[64px] whitespace-nowrap">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                            {staffItem.salesStaff.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-200 text-xs group-hover:text-amber-400 transition-colors">{staffItem.salesStaff}</div>
                            <div className="text-[9px] font-mono text-zinc-500">Sales Executive</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 text-center font-mono text-xs font-bold text-zinc-200">{staffItem.leads}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-purple-400">{staffItem.followUps}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-cyan-400">{staffItem.quotations}</td>
                      <td className="p-3.5 text-center font-mono text-xs font-bold text-emerald-400">{staffItem.ordersConfirmed}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-rose-400">{staffItem.lost}</td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(staffItem.conversionRate, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs font-bold text-amber-400">{staffItem.conversionRate}%</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-mono text-xs text-indigo-300">{formatCurrency(staffItem.quotationValue)}</td>
                      <td className="p-3.5 text-right font-mono text-xs font-bold text-emerald-400">{formatCurrency(staffItem.revenue)}</td>
                      <td className="p-3.5 text-center">
                        <button className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 text-[10px] font-mono font-bold transition-all">
                          View Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-zinc-500 font-mono text-xs">
                        No sales staff records found matching filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-zinc-900 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">
                  Page {currentPage} of {totalPages} ({currentActiveTabRows.length} Sales Staff)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sales Performance Charts hidden per user request */}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: OPERATIONS STAFF PERFORMANCE                 */}
      {/* ==================================================== */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_ops' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Operations Staff</span>
              <div className="text-xl font-black text-white mt-1">{opsData.summary.totalOpsStaff}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Field Team</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_ops' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Total Events</span>
              <div className="text-xl font-black text-blue-400 mt-1">{boCardsData.opsAll.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Assigned Events</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'ops_scheduled' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Events Started</span>
              <div className="text-xl font-black text-purple-400 mt-1">{boCardsData.opsScheduled.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">In Progress</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'ops_completed' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Events Completed</span>
              <div className="text-xl font-black text-emerald-400 mt-1">{boCardsData.opsCompleted.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Footage Captured</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'ops_upcoming' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Pending Events</span>
              <div className="text-xl font-black text-amber-400 mt-1">{boCardsData.opsUpcoming.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Upcoming</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_ops' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Completion Rate</span>
              <div className="text-xl font-black text-emerald-400 mt-1">{boCardsData.opsAll.length > 0 ? Math.round((boCardsData.opsCompleted.length / boCardsData.opsAll.length) * 100) : 0}%</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Fulfillment %</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_ops' }))}
              className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Avg Event Time</span>
              <div className="text-lg font-black text-cyan-400 mt-1">{opsData.summary.avgCompletionTime}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Turnaround</span>
            </div>
          </div>

          {/* Performance Ranking */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Trophy className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white font-mono">
                Operations Leaderboard & Crew Ranking
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {opsData.rankings.slice(0, 3).map((staffItem, idx) => {
                const medal = idx === 0 ? '🏆 1st Place' : idx === 1 ? '🥈 2nd Place' : '🥉 3rd Place';
                return (
                  <div key={staffItem.staff_id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-blue-400 uppercase">{medal}</span>
                      <h4 className="text-sm font-black text-white mt-1">{staffItem.operationsStaff}</h4>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{staffItem.staffType}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-400 font-mono">{staffItem.completionRate}% Rate</div>
                      <span className="text-[9px] text-zinc-500 font-mono">{staffItem.eventsCompleted} Completed</span>
                    </div>
                  </div>
                );
              })}
              {opsData.rankings.length === 0 && (
                <p className="text-xs font-mono text-zinc-500 italic col-span-3">No operations crew data found.</p>
              )}
            </div>
          </div>

          {/* Operations Table */}
          <div className="bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">Operations Staff Performance Roster</h3>
              </div>
              <span className="text-xs text-zinc-500 font-mono">Click any row to inspect assigned event tasks</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-900/40 border-b border-zinc-800">
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono text-center w-16 min-w-[64px] whitespace-nowrap">S.NO</th>
                    <SortHeader label="Operations Staff" sortKey="operationsStaff" />
                    <SortHeader label="Staff Type" sortKey="staffType" />
                    <SortHeader label="Events Assigned" sortKey="eventsAssigned" align="center" />
                    <SortHeader label="Events Started" sortKey="eventsStarted" align="center" />
                    <SortHeader label="Events Completed" sortKey="eventsCompleted" align="center" />
                    <SortHeader label="Pending" sortKey="pending" align="center" />
                    <SortHeader label="Completion Rate" sortKey="completionRate" align="center" />
                    <SortHeader label="Avg Completion Time" sortKey="avgCompletionTime" align="center" />
                    <th className="p-3.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {paginatedRows.map((staffItem, idx) => (
                    <tr 
                      key={staffItem.staff_id}
                      onClick={() => setSelectedStaffDetail({
                        staffName: staffItem.operationsStaff,
                        staffType: staffItem.staffType,
                        department: 'Operations',
                        totalAssigned: staffItem.eventsAssigned,
                        completed: staffItem.eventsCompleted,
                        inProgress: Math.max(0, staffItem.eventsStarted - staffItem.eventsCompleted),
                        pending: staffItem.pending,
                        completionRate: staffItem.completionRate,
                        avgCompletionTime: staffItem.avgCompletionTime,
                        tasks: staffItem.tasks
                      })}
                      className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                    >
                      <td className="p-3 font-mono text-zinc-400 text-center text-xs font-bold w-16 min-w-[64px] whitespace-nowrap">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                            {staffItem.operationsStaff.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-200 text-xs group-hover:text-blue-400 transition-colors">{staffItem.operationsStaff}</div>
                            <div className="text-[9px] font-mono text-zinc-500">Field Crew</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          staffItem.staffType === 'In House' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                        }`}>
                          {staffItem.staffType}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono text-xs font-bold text-zinc-200">{staffItem.eventsAssigned}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-purple-400">{staffItem.eventsStarted}</td>
                      <td className="p-3.5 text-center font-mono text-xs font-bold text-emerald-400">{staffItem.eventsCompleted}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-amber-400">{staffItem.pending}</td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(staffItem.completionRate, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs font-bold text-blue-400">{staffItem.completionRate}%</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-center font-mono text-xs text-zinc-400">{staffItem.avgCompletionTime}</td>
                      <td className="p-3.5 text-center">
                        <button className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 text-[10px] font-mono font-bold transition-all">
                          View Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-zinc-500 font-mono text-xs">
                        No operations staff records found matching filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="p-3 border-t border-zinc-900 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">
                  Page {currentPage} of {totalPages} ({currentActiveTabRows.length} Operations Staff)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Operations Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                Events Assigned vs Events Completed
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsData.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="operationsStaff" stroke="#71717a" fontSize={10} />
                    <YAxis stroke="#71717a" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="eventsAssigned" name="Assigned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="eventsCompleted" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                Staff Workload & Pending Work
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsData.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="operationsStaff" stroke="#71717a" fontSize={10} />
                    <YAxis stroke="#71717a" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="eventsStarted" name="In Progress" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: PRODUCTION STAFF PERFORMANCE                 */}
      {/* ==================================================== */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_prod' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Production Staff</span>
              <div className="text-xl font-black text-white mt-1">{prodData.summary.totalProdStaff}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Video Editors</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_prod' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Deliverables</span>
              <div className="text-xl font-black text-purple-400 mt-1">{boCardsData.prodAll.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Assigned Projects</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'prod_inprogress' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Editing Started</span>
              <div className="text-xl font-black text-blue-400 mt-1">{boCardsData.prodInProgress.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Timeline Active</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'prod_editing_completed' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Customer Review</span>
              <div className="text-xl font-black text-amber-400 mt-1">{boCardsData.prodEditingCompleted.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Sent to Client</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'prod_editing_completed' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Editing Completed</span>
              <div className="text-xl font-black text-cyan-400 mt-1">{boCardsData.prodEditingCompleted.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Export Done</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'prod_client_acceptance' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Client Acceptance</span>
              <div className="text-xl font-black text-emerald-400 mt-1">{boCardsData.prodClientAcceptance.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Approved</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'prod_client_acceptance' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Completed Total</span>
              <div className="text-xl font-black text-emerald-400 mt-1">{boCardsData.prodClientAcceptance.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Finalized</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'prod_new' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Pending</span>
              <div className="text-xl font-black text-rose-400 mt-1">{boCardsData.prodNew.length}</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">In Queue</span>
            </div>

            <div onClick={() => window.dispatchEvent(new CustomEvent('open-business-owner-card', { detail: 'overview_prod' }))}
              className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 hover:bg-zinc-900 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase">Completion Rate</span>
              <div className="text-xl font-black text-purple-400 mt-1">{boCardsData.prodAll.length > 0 ? Math.round((boCardsData.prodClientAcceptance.length / boCardsData.prodAll.length) * 100) : 0}%</div>
              <span className="text-[9px] text-zinc-500 font-mono mt-1">Output %</span>
            </div>
          </div>

          {/* Performance Ranking */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Trophy className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white font-mono">
                Production Editors Leaderboard & Ranking
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {prodData.rankings.slice(0, 3).map((staffItem, idx) => {
                const medal = idx === 0 ? '🏆 1st Place' : idx === 1 ? '🥈 2nd Place' : '🥉 3rd Place';
                return (
                  <div key={staffItem.staff_id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">{medal}</span>
                      <h4 className="text-sm font-black text-white mt-1">{staffItem.productionStaff}</h4>
                      <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{staffItem.staffType}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-400 font-mono">{staffItem.completionRate}% Rate</div>
                      <span className="text-[9px] text-zinc-500 font-mono">{staffItem.completed} Completed</span>
                    </div>
                  </div>
                );
              })}
              {prodData.rankings.length === 0 && (
                <p className="text-xs font-mono text-zinc-500 italic col-span-3">No production editors data available.</p>
              )}
            </div>
          </div>

          {/* Production Table */}
          <div className="bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">Production Staff / Editors Ledger</h3>
              </div>
              <span className="text-xs text-zinc-500 font-mono">Click any editor row to inspect assigned deliverables</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-900/40 border-b border-zinc-800">
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono text-center w-16 min-w-[64px] whitespace-nowrap">S.NO</th>
                    <SortHeader label="Production Staff" sortKey="productionStaff" />
                    <SortHeader label="Deliverables Assigned" sortKey="deliverablesAssigned" align="center" />
                    <SortHeader label="Editing Started" sortKey="editingStarted" align="center" />
                    <SortHeader label="Customer Review" sortKey="customerReview" align="center" />
                    <SortHeader label="Editing Completed" sortKey="editingCompleted" align="center" />
                    <SortHeader label="Client Acceptance" sortKey="clientAcceptance" align="center" />
                    <SortHeader label="Completed" sortKey="completed" align="center" />
                    <SortHeader label="Pending" sortKey="pending" align="center" />
                    <SortHeader label="Completion Rate" sortKey="completionRate" align="center" />
                    <th className="p-3.5 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {paginatedRows.map((staffItem, idx) => (
                    <tr 
                      key={staffItem.staff_id}
                      onClick={() => setSelectedStaffDetail({
                        staffName: staffItem.productionStaff,
                        staffType: staffItem.staffType,
                        department: 'Production',
                        totalAssigned: staffItem.deliverablesAssigned,
                        completed: staffItem.completed,
                        inProgress: staffItem.editingStarted + staffItem.customerReview,
                        pending: staffItem.pending,
                        completionRate: staffItem.completionRate,
                        avgCompletionTime: staffItem.avgCompletionTime,
                        tasks: staffItem.tasks
                      })}
                      className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                    >
                      <td className="p-3 font-mono text-zinc-400 text-center text-xs font-bold w-16 min-w-[64px] whitespace-nowrap">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                            {staffItem.productionStaff.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-200 text-xs group-hover:text-purple-400 transition-colors">{staffItem.productionStaff}</div>
                            <div className="text-[9px] font-mono text-zinc-500">Video Editor</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5 text-center font-mono text-xs font-bold text-zinc-200">{staffItem.deliverablesAssigned}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-blue-400">{staffItem.editingStarted}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-amber-400">{staffItem.customerReview}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-cyan-400">{staffItem.editingCompleted}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-emerald-400 font-bold">{staffItem.clientAcceptance}</td>
                      <td className="p-3.5 text-center font-mono text-xs font-bold text-emerald-400">{staffItem.completed}</td>
                      <td className="p-3.5 text-center font-mono text-xs text-rose-400">{staffItem.pending}</td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(staffItem.completionRate, 100)}%` }} />
                          </div>
                          <span className="font-mono text-xs font-bold text-purple-400">{staffItem.completionRate}%</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <button className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 text-[10px] font-mono font-bold transition-all">
                          View Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-zinc-500 font-mono text-xs">
                        No production staff records found matching filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="p-3 border-t border-zinc-900 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">
                  Page {currentPage} of {totalPages} ({currentActiveTabRows.length} Editors)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Production Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                Deliverables Assigned vs Completed
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prodData.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="productionStaff" stroke="#71717a" fontSize={10} />
                    <YAxis stroke="#71717a" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="deliverablesAssigned" name="Assigned" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-400" />
                Workload & Review Pipeline
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prodData.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="productionStaff" stroke="#71717a" fontSize={10} />
                    <YAxis stroke="#71717a" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="editingStarted" name="In Editing" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="customerReview" name="Customer Review" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clientAcceptance" name="Approved" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 12. STAFF DETAIL VIEW MODAL                          */}
      {/* ==================================================== */}
      {selectedStaffDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-900 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-base">
                  {selectedStaffDetail.staffName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-white">{selectedStaffDetail.staffName}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {selectedStaffDetail.staffType}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                      {selectedStaffDetail.department}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-500 mt-0.5">Individual Staff Performance Ledger & Task Breakdown</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStaffDetail(null)}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Summary KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 p-4 bg-zinc-900/30 border-b border-zinc-900">
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">Total Assigned</span>
                <div className="text-base font-black text-white mt-0.5">{selectedStaffDetail.totalAssigned}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">Completed</span>
                <div className="text-base font-black text-emerald-400 mt-0.5">{selectedStaffDetail.completed}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">In Progress</span>
                <div className="text-base font-black text-purple-400 mt-0.5">{selectedStaffDetail.inProgress}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">Pending</span>
                <div className="text-base font-black text-amber-400 mt-0.5">{selectedStaffDetail.pending}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">Completion Rate</span>
                <div className="text-base font-black text-amber-400 mt-0.5">{selectedStaffDetail.completionRate}%</div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">Avg Turnaround</span>
                <div className="text-base font-black text-cyan-400 mt-0.5">{selectedStaffDetail.avgCompletionTime}</div>
              </div>
            </div>

            {/* Individual Task Table */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-zinc-900/60 border-b border-zinc-800">
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Order ID</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Customer</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Event</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Assigned Deliverable</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Assigned Date</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Target Date</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Completed Date</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-zinc-400 font-mono">Current Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {selectedStaffDetail.tasks.map((task, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="p-3 text-xs font-mono font-bold text-amber-400">{task.orderId}</td>
                          <td className="p-3 text-xs font-medium text-zinc-200">{task.customerName}</td>
                          <td className="p-3 text-xs text-zinc-300">{task.eventName}</td>
                          <td className="p-3 text-xs text-zinc-400 font-mono">{task.taskDeliverable}</td>
                          <td className="p-3 text-xs text-zinc-400 font-mono">{task.assignedDate}</td>
                          <td className="p-3 text-xs text-zinc-400 font-mono">{task.targetDate}</td>
                          <td className="p-3 text-xs text-zinc-400 font-mono">{task.completedDate}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 border border-zinc-700 text-zinc-300">
                              {task.currentStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {selectedStaffDetail.tasks.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-zinc-500 font-mono text-xs">
                            No individual tasks assigned to this staff member in selected date range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-900 flex justify-end">
              <button 
                onClick={() => setSelectedStaffDetail(null)}
                className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white hover:bg-zinc-800 text-xs font-mono font-bold transition-all cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
