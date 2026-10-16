import { performBusinessOwnerReview } from "../utils/businessOwnerReview";
import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from './RoleContext';
import { 
  Users, Calendar, FileText, CheckCircle, Landmark, TrendingUp, AlertCircle, Clock, ShieldAlert, Sparkles, Filter, Sliders, ChevronRight,
  Aperture, Camera, FolderOpen, Image, ShieldCheck
} from 'lucide-react';
import { CurrentStage } from '../types';
import { CameraLensGraphic } from './ProductionModule';
import { formatINR, formatTime12Hour, getCustomers, formatDateTime, formatDateDDMMYY } from '../utils';
import { ProjectDetailModal } from './ProjectDetailModal';
import { AppLogo } from './AppLogo';
import { BusinessOwnerCalendar } from './BusinessOwnerCalendar';
import { CameraLensStatsCard, CameraLensTheme } from './CameraLensStatsCard';

export const Dashboard: React.FC = () => {
  const { leads, orders, production, payments, logs, operations, rawFootage, currentUserName, updateOrderStage, updateProduction, logActivity } = useRole();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<string>('All');
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);

  const reviewQueueOrders = useMemo(() => {
    const validStages = [
      'Client Acceptance',
      'Customer Review',
      'Editing Completed',
      'Editing Complete',
      'Final Approval',
      'Business Owner Review',
      'Approved',
      'Project Delivered'
    ];

    return orders.filter(order => {
      if (order.current_stage === 'Order Closed' || order.current_stage === 'Closed') return false;

      const prod = production.find(p => p.tracking_id === order.lead_id || p.order_id === order.lead_id || p.tracking_id === order.order_id);
      
      const orderStageMatch = validStages.includes(order.current_stage);
      const prodStageMatch = prod && validStages.includes(prod.editing_status);

      return orderStageMatch || prodStageMatch;
    });
  }, [orders, production]);

  const handleBusinessOwnerFinalApproval = async (order: any) => {
    const lead = leads.find(l => l.lead_id === order.lead_id);
    const prod = production.find(p => p.tracking_id === order.lead_id || p.order_id === order.lead_id || p.tracking_id === order.order_id);
    const payment = payments.find(p => p.order_id === order.order_id || p.lead_id === order.lead_id);

    const validation = performBusinessOwnerReview(order, lead, prod, payment);

    if (updateOrderStage) {
      await updateOrderStage(order.order_id, 'Order Closed');
    }

    if (prod && updateProduction) {
      await updateProduction(prod.production_id, {
        editing_status: 'Order Closed',
        production_status: 'Completed',
        remarks: `Final Approval granted by Business Owner (${currentUserName || 'Rupand Das'}) on ${formatDateTime(new Date())}`
      });
    }

    if (logActivity) {
      logActivity(
        `Order ${order.order_id} reviewed and closed by Business Owner (${currentUserName || 'Rupand Das'}). Final Approval granted. Customer Acceptance: Verified. Payment: ${validation.auditDetails.paymentDetailsVerified ? 'Verified' : 'Overridden'}.`,
        'Business Owner',
        order.order_id,
        'Business Owner Review',
        'Order Closed'
      );
    }

    setApprovalFeedback(`Order ${order.order_id} for ${order.customer_name} has been successfully approved and updated to 'Order Closed'.`);
    setTimeout(() => setApprovalFeedback(null), 6000);
  };

  useEffect(() => {
    const handleClose = () => {
      setIsDetailModalOpen(false);
    };
    window.addEventListener('close-all-popups', handleClose);
    return () => window.removeEventListener('close-all-popups', handleClose);
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (kpiFilter === 'All') return true;
      if (kpiFilter === 'Total Leads') return true;
      if (kpiFilter === "Today's Inflow") return true;
      if (kpiFilter === 'This Month Leads') {
        const thisMonthStr = new Date().toISOString().substring(0, 7);
        return order.event_date.startsWith(thisMonthStr);
      }
      if (kpiFilter === 'Signed Orders') {
        return order.order_status === 'Confirmed' || order.current_stage === 'Order Confirmed';
      }
      if (kpiFilter === 'Pending Shoots') {
        return order.current_stage !== 'Closed';
      }
      if (kpiFilter === 'Events Prepped') {
        return order.current_stage === 'Operations Assigned' || order.current_stage === 'Event Scheduled';
      }
      if (kpiFilter === 'Editing Suite') {
        const footage = rawFootage?.find(f => f.order_id === order.order_id);
        const prd = footage ? production.find(p => p.tracking_id === footage.tracking_id) : null;
        return prd && prd.editing_status !== 'Delivered' && prd.editing_status !== 'Approved';
      }
      if (kpiFilter === 'Delivered Reels') {
        const footage = rawFootage?.find(f => f.order_id === order.order_id);
        const prd = footage ? production.find(p => p.tracking_id === footage.tracking_id) : null;
        return prd && prd.editing_status === 'Delivered';
      }
      if (kpiFilter === 'Settled Ledger Balance') {
        const payment = payments.find(p => p.order_id === order.order_id);
        return payment && (payment.advance_received + payment.final_payment_received) > 0;
      }
      if (kpiFilter === 'Receivables') {
        const payment = payments.find(p => p.order_id === order.order_id);
        return payment && payment.balance_due > 0;
      }
      return true;
    });
  }, [orders, kpiFilter, rawFootage, production, payments]);

  const handleOpenDetailModal = (orderId: string) => {
    setSelectedProjectId(orderId);
    setIsDetailModalOpen(true);
  };

  // 1. Total Leads
  const totalLeads = leads.length;

  // 2. Today's Leads
  const todayIso = new Date().toISOString().split('T')[0];
  const todaysLeads = leads.filter(l => l.created_date === todayIso).length;

  // 3. This Month Leads
  const thisMonthStr = todayIso.substring(0, 7);
  const thisMonthLeads = leads.filter(l => l.created_date.startsWith(thisMonthStr)).length;

  // 4. Confirmed Orders (All orders are confirmed orders in this company)
  const confirmedOrdersNum = orders.length;

  // 5. Pending Orders (Orders in active stages, meaning not Closed)
  const pendingOrders = orders.filter(o => o.current_stage !== 'Closed').length;

  // 6. Events Scheduled (In Operations Assigned or Order Confirmed stage)
  const eventsScheduled = orders.filter(o => o.current_stage === 'Operations Assigned' || o.current_stage === 'Order Confirmed').length;

  // 7. Editing Pending (Active production tasks not yet delivered)
  const editingPending = production.filter(p => p.editing_status !== 'Delivered' && p.editing_status !== 'Approved').length;

  // 8. Delivered Projects (Delivered production projects)
  const deliveredProjects = production.filter(p => p.editing_status === 'Delivered').length;

  // 9 & 10. Financial Sums
  const totalOutstanding = payments.reduce((sum, p) => sum + p.balance_due, 0);
  const totalCollected = payments.reduce((sum, p) => sum + (p.advance_received + p.final_payment_received), 0);

  // 11. Conversion Percentage
  const conversionPct = totalLeads > 0 
    ? Math.round((confirmedOrdersNum / totalLeads) * 100) 
    : 0;

  // Pipeline stage groups to count
  const pipelineStages: { label: string; stages: CurrentStage[]; color: string; ringColor: string; bgBadge: string }[] = [
    { label: 'New Lead', stages: ['New Lead'], color: 'bg-indigo-500', ringColor: 'border-indigo-500/30', bgBadge: 'bg-indigo-500/10 text-indigo-400' },
    { label: 'Follow Up', stages: ['Follow Up'], color: 'bg-emerald-500', ringColor: 'border-emerald-500/30', bgBadge: 'bg-emerald-500/10 text-emerald-400' },
    { label: 'Quotation', stages: ['Quotation Sent', 'Negotiation'], color: 'bg-amber-500', ringColor: 'border-amber-500/30', bgBadge: 'bg-amber-500/10 text-amber-400' },
    { label: 'Confirmed', stages: ['Order Confirmed'], color: 'bg-orange-500', ringColor: 'border-orange-500/30', bgBadge: 'bg-orange-500/10 text-orange-450' },
    { label: 'Operations', stages: ['Operations Assigned', 'Event Scheduled'], color: 'bg-sky-500', ringColor: 'border-sky-500/30', bgBadge: 'bg-sky-500/10 text-sky-400' },
    { label: 'Production', stages: ['Event Completed', 'Raw Footage Received', 'Editor Assigned', 'Editing Started', 'Customer Review', 'Revision Required', 'Approved'], color: 'bg-pink-500', ringColor: 'border-pink-500/30', bgBadge: 'bg-pink-500/10 text-pink-400' },
    { label: 'Delivered', stages: ['Delivered'], color: 'bg-teal-500', ringColor: 'border-teal-500/30', bgBadge: 'bg-teal-500/10 text-teal-400' },
    { label: 'Closed', stages: ['Closed', 'Payment Pending'], color: 'bg-zinc-500', ringColor: 'border-zinc-500/30', bgBadge: 'bg-zinc-500/10 text-zinc-400' },
  ];

  const getStageCount = (stages: CurrentStage[]) => {
    return leads.filter(l => stages.includes(l.status)).length;
  };

  const executiveAnalytics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today);
    const sevenDaysAgo = new Date(todayDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = today.substring(0, 7); // YYYY-MM
    const thisYear = today.substring(0, 4);  // YYYY

    // 1. Revenue Calculations
    let todayRevenue = 0;
    let weeklyRevenue = 0;
    let monthlyRevenue = 0;
    let yearlyRevenue = 0;
    let totalRevenue = 0;

    payments.forEach(p => {
      const amount = (p.advance_received || 0) + (p.final_payment_received || 0) + (p.additional_received || 0);
      const pDateStr = p.payment_date || (p as any).created_at?.split('T')[0] || today;
      
      totalRevenue += amount;

      if (pDateStr === today) {
        todayRevenue += amount;
      }

      const pDate = new Date(pDateStr);
      if (pDate >= sevenDaysAgo && pDate <= new Date(todayDate.getTime() + 24 * 60 * 60 * 1000)) {
        weeklyRevenue += amount;
      }

      if (pDateStr.startsWith(thisMonth)) {
        monthlyRevenue += amount;
      }

      if (pDateStr.startsWith(thisYear)) {
        yearlyRevenue += amount;
      }
    });

    const outstandingPayments = payments.reduce((sum, p) => sum + (p.balance_due || 0), 0);
    const pendingPaymentsCount = payments.filter(p => p.balance_due > 0).length;
    const pendingPaymentsAmount = payments.filter(p => p.balance_due > 0).reduce((sum, p) => sum + (p.balance_due || 0), 0);

    const totalPotential = totalRevenue + outstandingPayments;
    const collectionRate = totalPotential > 0 ? Math.round((totalRevenue / totalPotential) * 100) : 100;

    // 2. Leads Calculations
    const totalLeadsCount = leads.length;
    const todayLeadsCount = leads.filter(l => l.created_date === today).length;
    
    const weeklyLeadsCount = leads.filter(l => {
      if (!l.created_date) return false;
      const lDate = new Date(l.created_date);
      return lDate >= sevenDaysAgo && lDate <= new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
    }).length;

    return {
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
      yearlyRevenue,
      totalRevenue,
      outstandingPayments,
      pendingPaymentsCount,
      pendingPaymentsAmount,
      collectionRate,
      totalLeadsCount,
      todayLeadsCount,
      weeklyLeadsCount
    };
  }, [payments, leads]);

  return (
    <div id="ceo_dashboard" className="space-y-8">
      {/* Business Owner Console Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-5 sm:p-6 rounded-2xl border border-amber-500/20 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1 px-3 bg-amber-500/20 text-amber-400 rounded-md font-mono text-[10px] font-black tracking-widest border border-amber-500/30">
                BUSINESS OWNER CONSOLE
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            </div>
            <div className="flex items-center gap-3">
              <AppLogo size="sm" showTextOnFallback={false} />
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
                Final Order Review & Authorization Dashboard
              </h1>
            </div>
            <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
              Review completed projects at Client Acceptance stage, verify customer feedback & payment ledger integrity, and grant Final Approval to close and archive orders.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 p-3 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Review Authority</div>
              <div className="text-xs font-bold text-amber-400">{currentUserName || "Rupand Das"} (Business Owner)</div>
            </div>
          </div>
        </div>
      </div>

      {approvalFeedback && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs font-bold font-mono flex items-center gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>{approvalFeedback}</span>
        </div>
      )}

      {/* 1. BUSINESS OWNER REVIEW QUEUE TABLE */}
      <div className="bg-zinc-900/80 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800 bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-wider font-mono">
              <span className="p-1 px-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] rounded font-bold">
                STAGE: CLIENT ACCEPTANCE
              </span>
              <span>BUSINESS OWNER REVIEW QUEUE</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Projects requiring final review of customer acceptance, payment status, and outstanding balance before order closure.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-xs font-mono font-bold">
              {reviewQueueOrders.length} Pending Approvals
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-zinc-950/90 text-zinc-400 font-bold border-b border-zinc-800 text-[10px] uppercase font-mono tracking-wider">
                <th className="p-3.5 pl-5">Order ID</th>
                <th className="p-3.5">Customer Name</th>
                <th className="p-3.5">Event Name</th>
                <th className="p-3.5">Current Status</th>
                <th className="p-3.5">Customer Acceptance</th>
                <th className="p-3.5">Payment Status</th>
                <th className="p-3.5 text-right">Outstanding Balance</th>
                <th className="p-3.5 text-right pr-5">Final Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300 font-sans">
              {reviewQueueOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500 font-mono text-xs">
                    No pending orders currently awaiting Business Owner final approval.
                  </td>
                </tr>
              ) : (
                reviewQueueOrders.map(order => {
                  const lead = leads.find(l => l.lead_id === order.lead_id);
                  const prod = production.find(p => p.tracking_id === order.lead_id || p.order_id === order.lead_id || p.tracking_id === order.order_id);
                  const payment = payments.find(p => p.order_id === order.order_id || p.lead_id === order.lead_id);

                  const eventName = order.event_type || lead?.custom_event_name || (lead?.events && lead.events[0]?.event_name) || "Shoot Event";
                  const currentStatus = order.current_stage || prod?.editing_status || "Client Acceptance";
                  
                  const paymentStatus = payment?.payment_status || (payment && payment.balance_due === 0 ? "Fully Paid" : "Pending");
                  const balanceDue = payment?.balance_due ?? order.balance_amount ?? 0;

                  return (
                    <tr key={order.order_id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="p-3.5 pl-5 font-mono text-amber-400 font-bold text-xs">
                        {order.order_id}
                      </td>
                      <td className="p-3.5 font-bold text-white text-xs">
                        {order.customer_name}
                      </td>
                      <td className="p-3.5 text-zinc-300 font-medium">
                        {eventName}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {currentStatus}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3" />
                          <span>Accepted</span>
                        </span>
                      </td>
                      <td className="p-3.5 font-mono">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                          paymentStatus === "Fully Paid" 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {paymentStatus}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-xs text-zinc-100">
                        ₹{Number(balanceDue).toLocaleString("en-IN")}
                      </td>
                      <td className="p-3.5 text-right pr-5">
                        <button
                          onClick={() => handleBusinessOwnerFinalApproval(order)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-lg shadow-md transition-all inline-flex items-center gap-1.5 cursor-pointer hover:scale-[1.02]"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Final Approval</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. EVENT CALENDAR */}
      <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800 p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>Studio Milestone Event Calendar</span>
          </h2>
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
            Showing Event, Reporting, Completion, Delivery & Closed Dates
          </span>
        </div>
        <BusinessOwnerCalendar />
      </div>

      {/* HIDDEN PREVIOUS DASHBOARD SECTIONS */}
      <div className="hidden" aria-hidden="true">
        {/* Cinematic Studio Header */}
      
      {/* Cinematic Studio Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4 sm:p-5 rounded-2xl border border-zinc-800/80 shadow-2xl">
        <div className="absolute top-0 right-0 w-full max-w-[400px] h-[400px] rounded-full bg-amber-500/[0.04] blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-full max-w-[300px] h-[300px] rounded-full bg-violet-600/[0.03] blur-[100px] pointer-events-none" />
        
        {/* Viewfinder frame decorations around header */}
        <div className="absolute top-4 left-4 viewfinder-corner-tl" />
        <div className="absolute top-4 right-4 viewfinder-corner-tr" />
        <div className="absolute bottom-4 left-4 viewfinder-corner-bl" />
        <div className="absolute bottom-4 right-4 viewfinder-corner-br" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10 px-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 rounded-md font-mono text-[10px] tracking-widest border border-amber-500/30">
                EXECUTIVE LIVE
              </span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <AppLogo size="sm" showTextOnFallback={false} className="self-start sm:self-auto" />
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white font-sans uppercase flex items-center gap-2">
                Studio Executive Console
              </h1>
            </div>
            
            <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              Real-time analytics engine tracking inbound wedding & event leads, live camera squads, editing pipelines, and secure ledger balance clearance.
            </p>
          </div>
          
          {/* Creative Shutter Sync calibration bar */}
          <div className="flex flex-col gap-1.5 self-start lg:self-auto">
            <div className="bg-black/80 backdrop-blur-md px-5 py-3 rounded-xl border border-zinc-800 flex items-center gap-4 text-[10px] font-mono tracking-widest text-zinc-400 uppercase shadow-inner">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>SHUTTER: <strong className="text-amber-400">1/250s</strong></span>
              </div>
              <span className="text-zinc-850">|</span>
              <div>APERTURE: <strong className="text-amber-400">ƒ/2.8</strong></div>
              <span className="text-zinc-850">|</span>
              <div>ISO: <strong className="text-emerald-400">800</strong></div>
            </div>
            <div className="text-[9px] font-mono text-zinc-550 text-right uppercase tracking-[0.15em] mr-1">
              Focal calibration: 50mm PRIME
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Global Business Analytics */}
      <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 sm:p-6 rounded-2xl border border-zinc-800 shadow-2xl space-y-6 relative overflow-hidden animate-in fade-in duration-300">
        <div className="absolute top-0 right-0 w-full max-w-[300px] h-[300px] rounded-full bg-amber-500/[0.02] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[200px] h-[200px] rounded-full bg-indigo-500/[0.02] blur-[100px] pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-850 pb-4 relative z-10">
          <div className="space-y-1">
            <h2 className="text-xs font-black text-white flex items-center gap-2 tracking-widest font-mono">
              <span className="p-1 px-2.5 bg-amber-500/10 text-amber-450 border border-amber-500/20 text-[9px] rounded font-black font-mono">EXECUTIVE DATA</span>
              <span>GLOBAL BUSINESS ANALYTICS</span>
            </h2>
            <p className="text-[11px] text-zinc-405">
              Live consolidated KPIs across sales, revenue collection, operations, and lead generation cycles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">REAL-TIME TELEMETRY</span>
          </div>
        </div>

        {/* Bento Grid: Revenue Analytics & Leads Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
          
          {/* Column 1: REVENUE ANALYTICS (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            <h3 className="text-[10.5px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono flex items-center gap-2">
              <span className="text-emerald-450">💰</span>
              <span>Revenue Analytics</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Today's Revenue */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Today's Revenue</span>
                <div className="text-lg font-black text-white font-mono">{formatINR(executiveAnalytics.todayRevenue)}</div>
                <div className="text-[9px] text-emerald-450 font-bold bg-emerald-500/10 px-2 py-0.5 rounded w-fit uppercase">Cleared Today</div>
              </div>

              {/* Weekly Revenue */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Weekly Revenue</span>
                <div className="text-lg font-black text-amber-400 font-mono">{formatINR(executiveAnalytics.weeklyRevenue)}</div>
                <div className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded w-fit uppercase">Last 7 Days</div>
              </div>

              {/* Monthly Revenue */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Monthly Revenue</span>
                <div className="text-lg font-black text-indigo-400 font-mono">{formatINR(executiveAnalytics.monthlyRevenue)}</div>
                <div className="text-[9px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded w-fit uppercase">This Month</div>
              </div>

              {/* Yearly Revenue */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Yearly Revenue</span>
                <div className="text-lg font-black text-purple-400 font-mono">{formatINR(executiveAnalytics.yearlyRevenue)}</div>
                <div className="text-[9px] text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded w-fit uppercase">This Year</div>
              </div>

              {/* Total Revenue */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Total Revenue</span>
                <div className="text-lg font-black text-emerald-450 font-mono">{formatINR(executiveAnalytics.totalRevenue)}</div>
                <div className="text-[9px] text-zinc-400">Cumulative collected funds</div>
              </div>

              {/* Outstanding Payments */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Outstanding</span>
                <div className="text-lg font-black text-rose-455 font-mono">{formatINR(executiveAnalytics.outstandingPayments)}</div>
                <div className="text-[9px] text-rose-455">Awaiting final collection</div>
              </div>

              {/* Pending Payments */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Pending Invoices</span>
                <div className="text-lg font-black text-sky-400 font-mono">{executiveAnalytics.pendingPaymentsCount}</div>
                <div className="text-[9px] text-zinc-400">Orders with active balance</div>
              </div>

              {/* Payment Collection Rate */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl space-y-2 transition-all">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Collection Rate</span>
                <div className="text-lg font-black text-emerald-450 font-mono">{executiveAnalytics.collectionRate}%</div>
                <div className="text-[9px] text-zinc-400">Overall collection performance</div>
              </div>

            </div>
          </div>

          {/* Column 2: LEADS ANALYTICS (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-[10.5px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono flex items-center gap-2">
              <span className="text-amber-500">📈</span>
              <span>Leads Analytics</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-4">
              
              {/* Total Leads */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl flex items-center justify-between transition-all">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Total Leads</span>
                  <div className="text-2xl font-black text-white font-mono">{executiveAnalytics.totalLeadsCount}</div>
                </div>
                <span className="text-2xl">👥</span>
              </div>

              {/* Today's Leads */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl flex items-center justify-between transition-all">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Today's Leads</span>
                  <div className="text-2xl font-black text-amber-450 font-mono">{executiveAnalytics.todayLeadsCount}</div>
                </div>
                <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-2 py-1 rounded font-mono uppercase">New</span>
              </div>

              {/* Weekly Leads */}
              <div className="bg-[#07070a]/80 border border-zinc-850/60 hover:border-zinc-800 p-4 rounded-xl flex items-center justify-between transition-all">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">Weekly Leads</span>
                  <div className="text-2xl font-black text-purple-400 font-mono">{executiveAnalytics.weeklyLeadsCount}</div>
                </div>
                <span className="text-[9px] text-purple-450 font-bold bg-purple-500/10 px-2 py-1 rounded font-mono uppercase">7 Days</span>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Grid: 11 Primary Metrics in Elegant Bento Style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(() => {
          const kpiCards = [
            {
              label: "Total Leads",
              val: totalLeads,
              theme: 'purple' as CameraLensTheme,
              trendText: "Live Queue",
              subText: "All Time",
              chartPoints: [10, 18, 14, 25, 20, 31, 35],
              colSpan: "col-span-1"
            },
            {
              label: "Today's Inflow",
              val: todaysLeads,
              theme: 'blue' as CameraLensTheme,
              trendText: "+12% growth",
              subText: "Today",
              chartPoints: [3, 8, 5, 12, 10, 15, 12],
              colSpan: "col-span-1"
            },
            {
              label: "This Month Leads",
              val: thisMonthLeads,
              theme: 'purple' as CameraLensTheme,
              trendText: "Active",
              subText: "Campaign",
              chartPoints: [15, 10, 19, 14, 22, 18, 26],
              colSpan: "col-span-1"
            },
            {
              label: "Signed Orders",
              val: confirmedOrdersNum,
              theme: 'green' as CameraLensTheme,
              trendText: "Verified",
              subText: "Contracts",
              chartPoints: [8, 15, 12, 20, 16, 25, 24],
              colSpan: "col-span-1"
            },
            {
              label: "Pending Shoots",
              val: pendingOrders,
              theme: 'red' as CameraLensTheme,
              trendText: "In Queue",
              subText: "Outstanding",
              chartPoints: [2, 4, 1, 5, 3, 6, 2],
              colSpan: "col-span-1"
            },
            {
              label: "Events Prepped",
              val: eventsScheduled,
              theme: 'gold' as CameraLensTheme,
              trendText: "Squad Ready",
              subText: "Pre-pro",
              chartPoints: [5, 9, 7, 14, 11, 16, 15],
              colSpan: "col-span-1"
            },
            {
              label: "Editing Suite",
              val: editingPending,
              theme: 'purple' as CameraLensTheme,
              trendText: "Active CC",
              subText: "Lightroom",
              chartPoints: [11, 14, 12, 18, 15, 20, 17],
              colSpan: "col-span-1"
            },
            {
              label: "Delivered Reels",
              val: deliveredProjects,
              theme: 'cyan' as CameraLensTheme,
              trendText: "Released",
              subText: "Galleries",
              chartPoints: [12, 18, 15, 26, 22, 34, 38],
              colSpan: "col-span-1"
            },
            {
              label: "Settled Ledger Balance",
              val: totalCollected,
              isCurrency: true,
              theme: 'gold' as CameraLensTheme,
              trendText: "Settled Ledger",
              subText: "CLEARED FUNDS",
              chartPoints: [20, 35, 28, 45, 52, 60, 75],
              colSpan: "col-span-1 sm:col-span-2"
            },
            {
              label: "Receivables",
              val: totalOutstanding,
              isCurrency: true,
              theme: 'red' as CameraLensTheme,
              trendText: "Pending",
              subText: "Balance",
              chartPoints: [45, 38, 42, 30, 25, 28, 22],
              colSpan: "col-span-1"
            },
            {
              label: "Lead Conversion",
              val: conversionPct,
              isPercentage: true,
              theme: 'green' as CameraLensTheme,
              trendText: "CR Target",
              subText: "Win Rate",
              chartPoints: [35, 45, 40, 55, 48, 62, 58],
              colSpan: "col-span-1"
            }
          ];

          return kpiCards.map((card, idx) => (
            <div key={idx} className={card.colSpan}>
              <CameraLensStatsCard
                label={card.label}
                val={card.val}
                theme={card.theme}
                trendText={card.trendText}
                subText={card.subText}
                chartPoints={card.chartPoints}
                isCurrency={card.isCurrency}
                isPercentage={card.isPercentage}
                currencyFormatter={formatINR}
                activeFilterValue={kpiFilter}
                currentFilterValue={card.label}
                onClick={() => setKpiFilter(kpiFilter === card.label ? 'All' : card.label)}
                lensLabel={card.label.slice(0, 10).toUpperCase()}
              />
            </div>
          ));
        })()}
      </div>

      {/* SECTION: Repeat Customer & Lifetime Value Analytics */}
      {(() => {
        const parsedCustomers = getCustomers(leads, orders, payments);
        const newCustomers = parsedCustomers.filter(c => c.totalOrders <= 1);
        const repeatCustomers = parsedCustomers.filter(c => c.totalOrders >= 2);
        const totalRepeatRevenue = repeatCustomers.reduce((sum, c) => sum + c.totalRevenue, 0);
        const totalCustomersCount = parsedCustomers.length;
        const averageCLV = totalCustomersCount > 0 
          ? Math.round(parsedCustomers.reduce((sum, c) => sum + c.totalRevenue, 0) / totalCustomersCount)
          : 0;
        const totalRetentionRate = totalCustomersCount > 0 
          ? Math.round((repeatCustomers.length / totalCustomersCount) * 100) 
          : 0;

        return (
          <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 rounded-2xl border border-zinc-900 shadow-2xl space-y-6 relative overflow-hidden animate-fade-in">
            <div className="absolute top-0 right-0 w-full max-w-[400px] h-[400px] rounded-full bg-violet-600/[0.02] blur-[150px] pointer-events-none" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-4 relative z-10">
              <div>
                <h3 className="text-xs font-black text-white flex items-center gap-2 tracking-widest font-mono">
                  <span className="p-1 px-2.5 bg-violet-500/15 text-violet-400 border border-violet-500/20 text-[9px] rounded font-black font-mono">CRM DATA COGNITION</span>
                  <span>RETENTION ANALYSIS & CUSTOMER LIFETIME VALUE (CLV)</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Loyalty rate modeling, repeat-buyer cohorts tracking, and cumulative lifetime billing clearances.
                </p>
              </div>
              
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20 font-black text-[10px] tracking-widest">
                  LOYALTY RETENTION RATE: {totalRetentionRate}%
                </span>
              </div>
            </div>

            {/* Metric Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
              <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-900/60 hover:border-zinc-850 transition-all duration-300 space-y-1">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">New Customers</span>
                <div className="text-xl font-black text-white">{newCustomers.length}</div>
                <p className="text-[10px] text-zinc-500">Single shoot transaction records</p>
              </div>
              
              <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-900/60 hover:border-zinc-850 transition-all duration-300 space-y-1">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">Repeat Customers</span>
                <div className="text-xl font-black text-orange-400">{repeatCustomers.length}</div>
                <p className="text-[10px] text-zinc-500">Multi-booking brand loyalists</p>
              </div>

              <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-900/60 hover:border-zinc-850 transition-all duration-300 space-y-1">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">Average CLV</span>
                <div className="text-xl font-black text-emerald-400">{formatINR(averageCLV)}</div>
                <p className="text-[10px] text-zinc-500">Arithmetic mean spend per customer</p>
              </div>

              <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-900/60 hover:border-zinc-850 transition-all duration-300 space-y-1">
                <span className="text-[9px] font-mono tracking-widest text-zinc-505 uppercase">Repeat Cohort Spend</span>
                <div className="text-xl font-black text-violet-400">{formatINR(totalRepeatRevenue)}</div>
                <p className="text-[10px] text-zinc-500">Total volume generated by retention</p>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="space-y-3 relative z-10">
              <div className="text-[10px] font-bold text-zinc-400 tracking-widest font-mono uppercase text-left">
                👥 HIGH RETENTION CUSTOMER LEADERBOARD
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950/20">
                <table className="w-full text-left border-collapse text-xs min-w-max">
                  <thead>
                    <tr className="bg-zinc-950/80 border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-mono">
                      <th className="p-3 pl-4">Customer ID</th>
                      <th className="p-3">Customer Full Name</th>
                      <th className="p-3">Contact Details</th>
                      <th className="p-3 text-center">Inquiries Logged</th>
                      <th className="p-3 text-center">Roster Orders</th>
                      <th className="p-3">Previous Packages Chosen</th>
                      <th className="p-3 text-right pr-4">Total Revenue Spend (CLV)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/30 text-zinc-300">
                    {parsedCustomers.map((cust) => (
                      <tr key={cust.customer_id} className="hover:bg-zinc-900/10 transition-all text-zinc-300">
                        <td className="p-3 pl-4 font-mono font-black text-amber-500">{cust.customer_id}</td>
                        <td className="p-3 text-zinc-100 font-bold">{cust.customer_name}</td>
                        <td className="p-3 font-mono text-zinc-400 text-[10px]">
                          <div>{cust.email || 'no-email-recorded'}</div>
                          <div>{cust.mobile || 'no-phone-recorded'}</div>
                        </td>
                        <td className="p-3 text-center font-mono text-zinc-400">{cust.leads.length}</td>
                        <td className="p-3 text-center font-mono">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            cust.totalOrders >= 2 
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' 
                              : 'bg-zinc-800/40 text-zinc-450 border-zinc-900'
                          }`}>
                            {cust.totalOrders} {cust.totalOrders >= 2 ? 'RETENTION' : 'SINGLE'}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-zinc-400 max-w-[220px] break-words">
                          {cust.previousPackages.join(', ') || 'N/A (Awaiting Order)'}
                        </td>
                        <td className="p-3 text-right pr-4 font-mono font-black text-emerald-400 text-[13px]">
                          {formatINR(cust.totalRevenue)}
                        </td>
                      </tr>
                    ))}
                    {parsedCustomers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-zinc-500 font-mono">
                          Awaiting customer records load synchronization...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Interactive photography vectorscope & real-time calibration monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Visual Calibration Meter */}
        <div className="lg:col-span-5 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 rounded-2xl border border-zinc-900 flex flex-col justify-between shadow-xl relative overflow-hidden">
          <div className="absolute top-4 right-4 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
            VECTORSCOPE // CAL-01
          </div>
          
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-widest font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>LIVE VECTORSCOPE INTEGRATOR</span>
            </h3>
            <p className="text-[11px] text-zinc-400">
              Interactive visualization of active photography color grading ranges.
            </p>
          </div>

          {/* SVG vectorscope simulation */}
          <div className="my-6 flex items-center justify-center">
            <div className="relative w-44 h-44 border-2 border-dashed border-zinc-800 rounded-full flex items-center justify-center">
              {/* Target lines */}
              <div className="absolute w-full h-[1px] bg-zinc-850" />
              <div className="absolute h-full w-[1px] bg-zinc-850" />
              {/* Outer markers */}
              <div className="absolute top-1 text-[8px] font-mono text-rose-500 font-black">R</div>
              <div className="absolute right-1 text-[8px] font-mono text-amber-500 font-black font-semibold">YL</div>
              <div className="absolute left-1 text-[8px] font-mono text-indigo-400 font-black">B</div>
              <div className="absolute bottom-1 text-[8px] font-mono text-emerald-400 font-black">G</div>
              
              {/* Interactive circular ranges with radial dots */}
              <div className="absolute w-28 h-28 border border-zinc-850 rounded-full" />
              <div className="absolute w-14 h-14 border border-zinc-850/60 rounded-full" />
              
              {/* Dynamic waveform spline */}
              <svg className="absolute inset-0 w-full h-full transform rotate-12" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="1.5" className="fill-amber-500" />
                <path 
                  d="M 50 50 Q 64 35 70 48 T 50 50 Q 32 60 40 42 T 50 50" 
                  fill="none" 
                  stroke="url(#grade_gradient)" 
                  strokeWidth="1.5" 
                  className="animate-[pulse_4s_infinite_alternate]"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="grade_gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#ec4899" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex justify-between border-b border-zinc-850 pb-1.5">
              <span className="text-zinc-500">Color Balance:</span>
              <span className="text-zinc-200">5600K DAYLIGHT</span>
            </div>
            <div className="flex justify-between border-b border-zinc-850 pb-1.5">
              <span className="text-zinc-500">Active Cameras:</span>
              <span className="text-emerald-400">Sony FX6 + RED V-Raptor</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Signal Integrity:</span>
              <span className="text-amber-400 font-bold">10-BIT 4:2:2 PRORES</span>
            </div>
          </div>
        </div>

        {/* FOCAL RANGE PIPELINE SYSTEM */}
        <div className="lg:col-span-7 bg-zinc-900/40 p-6 rounded-2xl border border-zinc-900/80 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-500">📸</span>
                <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-widest font-mono">
                  FOCAL RANGE WORKFLOW PIPELINE
                </h3>
              </div>
              <span className="text-[9px] bg-zinc-950 text-zinc-400 px-2.5 py-1 rounded-md font-mono border border-zinc-800/80">
                STAGE-FLOW INDEX RATIO
              </span>
            </div>
            
            <p className="text-xs text-zinc-400">
              Interactive progression matrix showing how leads transition to confirmed camera contracts, live crew shoots, post-production render pipelines, and final master archives.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-6">
            {pipelineStages.map((ps) => {
              const count = getStageCount(ps.stages);
              return (
                <div key={ps.label} className="bg-zinc-950/80 border border-zinc-850 p-4 rounded-xl flex flex-col justify-between hover:border-zinc-800 hover:shadow-lg transition-all duration-200 relative group">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9.5px] font-extrabold text-zinc-450 uppercase tracking-wider font-mono break-words max-w-[80px]">
                      {ps.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold ${ps.bgBadge}`}>
                      {count} lead{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-black text-white font-mono">{count}</span>
                    <span className="text-[9px] text-zinc-650 font-mono">STATIONED</span>
                  </div>

                  <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden mt-3">
                    <div 
                      className={`h-full ${ps.color}`} 
                      style={{ width: count > 0 ? `${Math.min(100, (count / totalLeads) * 100)}%` : '0%' }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-850 flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-sans">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Conversion conversionPct is currently optimized at <strong className="text-amber-400">{conversionPct}%</strong>.</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">JUN 2026</span>
          </div>
        </div>

      </div>


      {/* ALL PROJECTS MASTER WORKFLOW LEDGER */}
      {kpiFilter !== 'All' && (
        <div className="bg-zinc-950 px-4 py-3 flex items-center justify-between text-xs text-zinc-400 border border-zinc-910 rounded-xl mb-3">
          <span className="flex items-center gap-2 font-mono text-[11px]">
            <span className="bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Filtered View</span>
            <span>Showing records for metric: <strong className="text-white">{kpiFilter}</strong> ({filteredOrders.length} records found)</span>
          </span>
          <button 
            onClick={() => setKpiFilter('All')}
            className="text-amber-400 hover:text-amber-300 font-mono text-[11px] bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1 rounded-lg border border-amber-500/30 transition-all font-bold uppercase cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      )}

      <div className="bg-zinc-900/40 rounded-xl border border-zinc-900 shadow-xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-900 bg-zinc-900/60 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></div>
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-widest font-mono">
              ALL DEPARTMENTS MASTER WORKFLOW PIPELINE
            </h3>
          </div>
          <span className="text-[9.5px] bg-zinc-950 text-amber-400 px-3 py-1 rounded font-mono border border-zinc-850 tracking-widest font-medium">
            OWNER_OVERSIGHT // LIVE FEED
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-zinc-950/80 text-zinc-400 font-bold border-b border-zinc-900 text-[10px] uppercase font-mono tracking-wider">
                <th className="p-3 pl-5">Order ID</th>
                <th className="p-3">Customer & Package</th>
                <th className="p-3">current stage</th>
                <th className="p-3">Ops / Crew Assignments</th>
                <th className="p-3">Post-production edits</th>
                <th className="p-3">billings status</th>
                <th className="p-3">Revenue (₹)</th>
                <th className="p-3 text-right pr-5">action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60 font-sans text-zinc-300">
              {filteredOrders.map((order) => {
                const operation = operations?.find(op => op.order_id === order.order_id);
                const footage = rawFootage?.find(f => f.order_id === order.order_id);
                const prd = footage ? production.find(p => p.tracking_id === footage.tracking_id) : undefined;
                const payment = payments.find(py => py.order_id === order.order_id);

                return (
                  <tr key={order.order_id} className="hover:bg-zinc-900/35 transition-all">
                    {/* Order ID */}
                    <td className="p-3 pl-5 font-mono text-[11px] text-zinc-400 font-bold">
                      {order.order_id}
                    </td>

                    {/* Customer & Package */}
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-150 text-[13px]">{order.customer_name}</span>
                        <span className="text-[10px] text-amber-500 font-mono tracking-wide">{order.package_name || 'Shoot'}</span>
                        <span className="text-[9px] text-zinc-550 font-mono">Date: {order.event_date ? (formatDateDDMMYY(order.event_date) || order.event_date) : 'N/A'}</span>
                      </div>
                    </td>

                    {/* Current Stage */}
                    <td className="p-3 font-mono">
                      <span className="px-2 py-0.5 rounded text-[9.5px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {order.current_stage}
                      </span>
                    </td>

                    {/* Crew Assignments */}
                    <td className="p-3 font-mono text-[10px]">
                      {operation ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-400"><strong className="text-zinc-500">Photo:</strong> {operation.photographer_assigned || 'Unassigned'}</span>
                          <span className="text-zinc-400"><strong className="text-zinc-500">Video:</strong> {operation.videographer_assigned || 'Unassigned'}</span>
                          <span className="text-emerald-450 font-semibold">{operation.event_status || 'Scheduled'}</span>
                        </div>
                      ) : (
                        <span className="text-rose-500/70 italic text-[10px]">Roster Pending</span>
                      )}
                    </td>

                    {/* Post production edits */}
                    <td className="p-3 font-mono text-[10px]">
                      {prd ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-400"><strong className="text-zinc-500">Editor:</strong> {prd.editor_assigned || 'Unassigned'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase w-fit ${
                            prd.editing_status === 'Delivered' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10' :
                            'bg-indigo-500/15 text-indigo-400 border border-indigo-500/10'
                          }`}>
                            {prd.editing_status || 'Pending'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-550 italic text-[10px]">Post Gated</span>
                      )}
                    </td>

                    {/* Billing Status */}
                    <td className="p-3 font-mono">
                      {payment ? (
                        <div className="flex flex-col text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black w-fit uppercase ${
                            payment.payment_status === 'Fully Paid' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {payment.payment_status}
                          </span>
                          <span className="text-[10px] text-rose-455 font-bold mt-0.5">Due: {formatINR(payment.balance_due)}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-650 italic">N/A</span>
                      )}
                    </td>

                    {/* Revenue */}
                    <td className="p-3 font-mono text-zinc-100 font-extrabold text-[12px]">
                      {formatINR(order.quotation_amount)}
                    </td>

                    {/* Action button */}
                    <td className="p-3 text-right pr-5">
                      <button
                        onClick={() => handleOpenDetailModal(order.order_id)}
                        className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-900 text-amber-400 hover:text-white border border-zinc-850 hover:border-zinc-700 font-bold rounded text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                      >
                        <span>Open Dossier</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <BusinessOwnerCalendar />
      </div>

            </div>

      <ProjectDetailModal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)} 
        orderId={selectedProjectId} 
      />

      {/* Audit Log Overview */}
      <div className="bg-zinc-900/40 rounded-xl border border-zinc-900 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-900 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-widest font-mono">
              STUDIO DIGITAL AUDIT & SECURITY TRAIL
            </h3>
          </div>
          <span className="text-[9.5px] bg-zinc-950 text-amber-400 px-3 py-1 rounded font-mono border border-zinc-850 tracking-widest font-medium">
            AES_256_STABLE
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-zinc-950/80 text-zinc-400 font-bold border-b border-zinc-900 text-[10px] uppercase font-mono tracking-wider">
                <th className="p-3.5 pl-5">Audit ID</th>
                <th className="p-3.5">Creative Operative</th>
                <th className="p-3.5">Division Access</th>
                <th className="p-3.5 ">Action Conducted</th>
                <th className="p-3.5">Division Code</th>
                <th className="p-3.5">Reference key</th>
                <th className="p-3.5 text-right pr-5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60 font-sans text-zinc-300">
              {logs.slice(0, 6).map((log) => (
                <tr key={log.log_id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-3.5 pl-5 font-mono text-[10px] text-amber-500/80 font-bold">
                    {log.log_id}
                  </td>
                  <td className="p-3.5 font-bold text-zinc-100 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-zinc-800 text-[9.5px] font-black text-amber-400 flex items-center justify-center font-mono border border-zinc-700 uppercase">
                      {log.user_name.substring(0, 2)}
                    </div>
                    <span>{log.user_name}</span>
                  </td>
                  <td className="p-3.5 font-mono text-[10px]">
                    <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold border ${
                      log.role === 'Business Owner' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      log.role === 'Sales Team' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      log.role === 'Operations Team' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                      'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    }`}>
                      {log.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3.5 font-sans text-zinc-200">
                    {log.action}
                  </td>
                  <td className="p-3.5 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    {log.module}
                  </td>
                  <td className="p-3.5 font-mono text-[10px] text-zinc-400 font-bold">
                    {log.record_id}
                  </td>
                  <td className="p-3.5 text-right text-[10px] text-zinc-500 pr-5 font-mono">
                    {formatTime12Hour(log.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
