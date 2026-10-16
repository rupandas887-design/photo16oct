import React, { useState, useMemo, useEffect } from 'react';
import { useRole } from '../RoleContext';
import { DatePreset, getPresetDateRange, isDateInRange, TODAY_REF } from './DateFilterHelper';
import { DatePresetSelector } from './DatePresetSelector';
import { AnalyticsReportModal } from './AnalyticsReportModal';
import { formatINR } from '../../utils';
import { CameraLensStatsCard } from '../CameraLensStatsCard';
import { calculateAllPendingRecords } from '../../utils/paymentCalculations';
import { 
  DollarSign, TrendingUp, AlertTriangle, ShieldCheck, Briefcase, Calendar, Users, 
  HelpCircle, ChevronRight, Activity, Percent, Sparkles, PieChart, FileText, Filter
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend 
} from 'recharts';

export const BusinessOverviewAnalytics: React.FC = () => {
  const { leads, orders, payments, operations, production, staff, globalDateRange, paymentHistory, refreshData } = useRole();

  useEffect(() => {
    const handleSync = () => {
      if (typeof refreshData === 'function') {
        refreshData();
      }
    };
    window.addEventListener('payment-updated', handleSync);
    window.addEventListener('lead-updated', handleSync);
    window.addEventListener('order-updated', handleSync);
    window.addEventListener('refresh-pending-payments', handleSync);
    return () => {
      window.removeEventListener('payment-updated', handleSync);
      window.removeEventListener('lead-updated', handleSync);
      window.removeEventListener('order-updated', handleSync);
      window.removeEventListener('refresh-pending-payments', handleSync);
    };
  }, [refreshData]);

  // Drilldown Modal states
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Active Date Bounds are the global range from context
  const activeRange = globalDateRange;
  const [showFilters, setShowFilters] = useState(false);

  // Filtered Datasets based on dates
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const orderDate = o.created_at ? o.created_at.split('T')[0] : o.event_date;
      return isDateInRange(orderDate, activeRange);
    });
  }, [orders, activeRange]);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const o = orders.find(ord => ord.order_id === p.order_id);
      const payDate = o?.created_at ? o.created_at.split('T')[0] : o?.event_date || TODAY_REF;
      return isDateInRange(payDate, activeRange);
    });
  }, [payments, orders, activeRange]);

  // Unified Pending Records from single source of truth (Sales Payment Pending)
  const pendingRecords = useMemo(() => {
    return calculateAllPendingRecords(orders, leads, payments, paymentHistory);
  }, [orders, leads, payments, paymentHistory]);

  // 1. Revenue Analytics calculations
  const totalRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.quotation_amount || 0), 0);
  }, [filteredOrders]);

  const totalReceived = useMemo(() => {
    return filteredPayments.reduce((sum, p) => sum + (p.advance_received + p.final_payment_received), 0);
  }, [filteredPayments]);

  // Outstanding is the exact total pending payment from Sales Dashboard Payment Pending
  const outstandingBalance = useMemo(() => {
    return pendingRecords.reduce((sum, r) => sum + (r.paymentStatus === 'Fully Paid' ? 0 : r.remainingAmount), 0);
  }, [pendingRecords]);

  const totalPendingAmount = outstandingBalance;

  const partialPaymentAmount = useMemo(() => {
    return pendingRecords
      .filter(r => r.paymentStatus === 'Partial')
      .reduce((sum, r) => sum + r.approvedAmount, 0);
  }, [pendingRecords]);

  // 2. Event Analytics calculations
  const totalEvents = filteredOrders.length;
  
  const completedEvents = filteredOrders.filter(o => 
    o.current_stage === 'Event Completed' || o.current_stage === 'Closed' || o.current_stage === 'Delivered'
  ).length;

  const upcomingEvents = filteredOrders.filter(o => o.event_date >= TODAY_REF).length;
  const ongoingEvents = filteredOrders.filter(o => o.event_date === TODAY_REF).length;
  const cancelledEvents = filteredOrders.filter(o => o.current_stage === 'Closed' && o.quotation_amount === 0).length;

  // 3. Payment Analytics calculations
  const fullyPaidEvents = filteredPayments.filter(p => p.payment_status === 'Fully Paid').length;
  const partiallyPaidEvents = filteredPayments.filter(p => p.payment_status === 'Partially Paid').length;
  const pendingPaymentEvents = filteredPayments.filter(p => p.payment_status === 'Pending').length;

  // 4. Team Analytics calculations
  const activeStaffCount = staff.filter(s => s.status === 'Active').length;
  
  const activeEditorsCount = useMemo(() => {
    const editors = production
      .filter(p => p.editing_status !== 'Project Closed')
      .map(p => p.editor_assigned)
      .filter(e => e && e !== 'Unassigned');
    return new Set(editors).size;
  }, [production]);

  const activeProjectsCount = production.filter(p => p.editing_status !== 'Project Closed').length;
  
  const currentWorkloadCount = useMemo(() => {
    // Total pending task items assigned (not Approved/Delivered/Closed)
    return production.filter(p => 
      p.editing_status !== 'Project Closed' && 
      p.editing_status !== 'Project Delivered' && 
      p.editing_status !== 'Final Approval'
    ).length;
  }, [production]);

  // Double area line graph (Revenue vs Received)
  const cumulativeFinancials = useMemo(() => {
    const datesMap: { [key: string]: { name: string; revenue: number; received: number } } = {};
    
    // Seed
    const startD = new Date(activeRange.start);
    const endD = new Date(activeRange.end);
    let curr = new Date(startD);
    let iter = 0;
    while(curr <= endD && iter < 31) {
      const dStr = curr.toISOString().split('T')[0];
      datesMap[dStr] = { name: dStr.substring(5), revenue: 0, received: 0 };
      curr.setDate(curr.getDate() + 1);
      iter++;
    }

    filteredOrders.forEach(o => {
      const d = o.created_at ? o.created_at.split('T')[0] : o.event_date;
      if (datesMap[d]) {
        datesMap[d].revenue += o.quotation_amount || 0;
      }
    });

    filteredPayments.forEach(p => {
      const o = orders.find(ord => ord.order_id === p.order_id);
      const d = o?.created_at ? o.created_at.split('T')[0] : (o?.event_date || TODAY_REF);
      if (datesMap[d]) {
        datesMap[d].received += (p.advance_received + p.final_payment_received);
      }
    });

    return Object.values(datesMap).sort((a,b)=>a.name.localeCompare(b.name));
  }, [filteredOrders, filteredPayments, orders, activeRange]);

  return (
    <div className="space-y-8">
      
      {/* Dynamic Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-black uppercase text-amber-500 font-mono tracking-[0.2em] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <span>CENTRAL CEO CONSOLIDATED DESK</span>
          </h2>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Complete executive overview detailing real-time transactional ratios, logistical events, billing entries, and staff workload parameters.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-850 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
              showFilters ? 'border-amber-500/40 text-amber-400 bg-amber-500/5' : 'border-zinc-800 text-zinc-400'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter / Download</span>
          </button>
          <div className="p-2 py-1.5 rounded-xl bg-zinc-900 border border-zinc-850/80 flex items-center gap-2.5 h-9">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-mono text-zinc-450 uppercase font-bold">
              Executive Ledger Synchronized
            </span>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="flex justify-end bg-zinc-950/20 border border-zinc-900 p-3 rounded-xl animate-in fade-in duration-200">
          <button
            onClick={() => setSelectedCard('Complete Business Overview')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer h-9 shadow-md shadow-black/10"
          >
            <FileText className="w-4 h-4" />
            <span>Download Report</span>
          </button>
        </div>
      )}

      {/* 4 Dedicated Sections Bento-Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Section 1: Revenue Analytics */}
        <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-5 space-y-4 relative">
          <div className="absolute top-4 right-4 text-[9px] font-mono text-emerald-400 font-black tracking-wider uppercase bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded">
            Finances Overview
          </div>
          <div className="flex items-center gap-2">
            <div className="p-1 px-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-xs font-bold">₹</div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">Revenue Analytics</h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <CameraLensStatsCard
              label="Total Revenue"
              val={totalRevenue}
              theme="purple"
              trendText="Total Contracted value"
              subText="AF Zoom"
              chartPoints={[10, 15, 12, 19, 14, 25, 23]}
              isCurrency={true}
              currencyFormatter={formatINR}
              onClick={() => setSelectedCard('Total Revenue')}
              lensLabel="CINE 24mm"
            />
            <CameraLensStatsCard
              label="Liquid Cash Received"
              val={totalReceived}
              theme="green"
              trendText="Secured Cleared funds"
              subText="AF Continuous"
              chartPoints={[15, 20, 18, 25, 22, 30, 28]}
              isCurrency={true}
              currencyFormatter={formatINR}
              onClick={() => setSelectedCard('Total Amount Received')}
              lensLabel="CINE 50mm"
            />
            <CameraLensStatsCard
              label="Consolidated Pending"
              val={totalPendingAmount}
              theme="gold"
              trendText="Receivables backlog"
              subText="AF Tracking"
              chartPoints={[8, 12, 9, 14, 11, 15, 13]}
              isCurrency={true}
              currencyFormatter={formatINR}
              onClick={() => setSelectedCard('Total Pending Amount')}
              lensLabel="CINE 85mm"
            />
            <CameraLensStatsCard
              label="Partial Paid Deposits"
              val={partialPaymentAmount}
              theme="cyan"
              trendText="Deposits milestone"
              subText="AF Locked"
              chartPoints={[12, 16, 14, 18, 15, 22, 19]}
              isCurrency={true}
              currencyFormatter={formatINR}
              onClick={() => setSelectedCard('Partial Payment Amount')}
              lensLabel="CINE 135mm"
            />
            <div className="col-span-2">
              <CameraLensStatsCard
                label="Outstanding Balance"
                val={outstandingBalance}
                theme="red"
                trendText="Deficit remaining"
                subText="AF Lockout"
                chartPoints={[5, 11, 7, 12, 9, 16, 14]}
                isCurrency={true}
                currencyFormatter={formatINR}
                onClick={() => setSelectedCard('Outstanding Balance')}
                lensLabel="CINE ZOOM"
              />
            </div>
          </div>
        </div>        {/* Section 2: Event Analytics */}
        <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-5 space-y-4 relative">
          <div className="absolute top-4 right-4 text-[9px] font-mono text-blue-400 font-black tracking-wider uppercase bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded">
            Shoots Schedule
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">Event Analytics</h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <CameraLensStatsCard
              label="Total Shoot Calls"
              val={totalEvents}
              theme="blue"
              trendText="Configured Events"
              onClick={() => setSelectedCard('Total Events')}
              lensLabel="PRIME 16mm"
            />
            <CameraLensStatsCard
              label="Completed Assignments"
              val={completedEvents}
              theme="green"
              trendText="Captured Shoot logs"
              onClick={() => setSelectedCard('Completed Events')}
              lensLabel="PRIME 28mm"
            />
            <CameraLensStatsCard
              label="Upcoming Calendar Lines"
              val={upcomingEvents}
              theme="cyan"
              trendText="Planned Lineups"
              onClick={() => setSelectedCard('Upcoming Events')}
              lensLabel="PRIME 50mm"
            />
            <CameraLensStatsCard
              label="Currently Active Today"
              val={ongoingEvents}
              theme="gold"
              trendText="On-set Action tracker"
              onClick={() => setSelectedCard('Ongoing Events')}
              lensLabel="PRIME 85mm"
            />
            <div className="col-span-2">
              <CameraLensStatsCard
                label="Cancelled Events"
                val={cancelledEvents}
                theme="red"
                trendText="Struck schedule entries"
                onClick={() => setSelectedCard('Cancelled Events')}
                lensLabel="PRIME 135mm"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Payment Analytics */}
        <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-5 space-y-4 relative">
          <div className="absolute top-4 right-4 text-[9px] font-mono text-indigo-400 font-black tracking-wider uppercase bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded">
            Billing Stages
          </div>
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-455" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">Payment Analytics</h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CameraLensStatsCard
              label="Fully Settled"
              val={fullyPaidEvents}
              theme="green"
              trendText="Cleared standard accounts"
              onClick={() => setSelectedCard('Fully Paid Events')}
              lensLabel="ZOOM 16-35"
            />
            <CameraLensStatsCard
              label="Partially Paid"
              val={partiallyPaidEvents}
              theme="gold"
              trendText="Ongoing advances"
              onClick={() => setSelectedCard('Partially Paid Events')}
              lensLabel="ZOOM 24-70"
            />
            <CameraLensStatsCard
              label="Pending Transactions"
              val={pendingPaymentEvents}
              theme="red"
              trendText="Unsettled logs"
              onClick={() => setSelectedCard('Pending Payment Events')}
              lensLabel="ZOOM 70-200"
            />
          </div>
        </div>

        {/* Section 4: Team Analytics */}
        <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-5 space-y-4 relative">
          <div className="absolute top-4 right-4 text-[9px] font-mono text-yellow-500 font-black tracking-wider uppercase bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 rounded">
            Resource Rig
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">Team / Capacity Analytics</h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <CameraLensStatsCard
              label="Total Manpower"
              val={activeStaffCount}
              theme="blue"
              trendText="Active crew personnel"
              onClick={() => setSelectedCard('Active Staff')}
              lensLabel="TELE 100mm"
            />
            <CameraLensStatsCard
              label="VFX Editor Pool"
              val={activeEditorsCount}
              theme="cyan"
              trendText="Allocated editors"
              onClick={() => setSelectedCard('Active Editors')}
              lensLabel="TELE 135mm"
            />
            <CameraLensStatsCard
              label="Live Progress Files"
              val={activeProjectsCount}
              theme="purple"
              trendText="Active editing folders"
              onClick={() => setSelectedCard('Active Projects')}
              lensLabel="TELE 200mm"
            />
            <CameraLensStatsCard
              label="Concurrent Pipelines"
              val={currentWorkloadCount}
              theme="gold"
              trendText="Assigned pending tasks"
              onClick={() => setSelectedCard('Current Workload')}
              lensLabel="TELE 400mm"
            />
          </div>
        </div>

      </div>

      {/* Visual Recharts Section */}
      <div className="bg-zinc-950/50 border border-zinc-850 p-4 sm:p-5 rounded-3xl space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-black uppercase text-zinc-300 font-mono tracking-wider">
            Consolidated Financial Performance: Revenue vs Liquid Cash Received
          </h4>
        </div>
        
        <div className="h-[240px] w-full">
          {cumulativeFinancials.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeFinancials} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="chartReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={9} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={9} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  itemStyle={{ fontSize: '11px' }}
                />
                <Legend verticalAlign="top" height={36} iconSize={10} style={{ fontSize: '10px' }} />
                <Area type="monotone" name="Contracted Revenue" dataKey="revenue" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#chartRevenue)" />
                <Area type="monotone" name="Liquid Cash Captured" dataKey="received" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#chartReceived)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-550 border border-dashed border-zinc-850 rounded-xl font-sans italic text-xs">
              No financial data logged in this scope.
            </div>
          )}
        </div>
      </div>

      {/* Analytics Drilldown Modal */}
      {selectedCard && (
        <AnalyticsReportModal
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
          reportTitle={`BUSINESS OVERVIEW DETAILED DOSSIER: ${selectedCard.toUpperCase()}`}
          reportType="business_overview"
          cardName={selectedCard}
          leads={leads}
          orders={orders}
          payments={payments}
          operations={operations}
          production={production}
          staff={staff}
        />
      )}

    </div>
  );
};
