import React, { useState, useMemo } from 'react';
import { useRole } from '../RoleContext';
import { DatePreset, getPresetDateRange, isDateInRange, TODAY_REF } from './DateFilterHelper';
import { DatePresetSelector } from './DatePresetSelector';
import { AnalyticsReportModal } from './AnalyticsReportModal';
import { formatINR } from '../../utils';
import { CameraLensStatsCard, CameraLensTheme } from '../CameraLensStatsCard';
import { 
  Users, MessageSquare, PhoneCall, FileText, Send, DollarSign,
  TrendingUp, Percent, BarChart3, ChevronRight, Camera, Trophy, Filter
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend 
} from 'recharts';

export const SalesAnalytics: React.FC = () => {
  const { leads, orders, quotations, payments, operations, production, staff, globalDateRange } = useRole();
  
  // Selected Card for Report Popup
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Active Date Bounds are the global range from context
  const activeRange = globalDateRange;

  // Filtered dataset variables
  const filteredLeads = useMemo(() => {
    return leads.filter(l => isDateInRange(l.created_date, activeRange));
  }, [leads, activeRange]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => isDateInRange(o.created_at ? o.created_at.split('T')[0] : o.event_date, activeRange));
  }, [orders, activeRange]);

  const filteredQuotations = useMemo(() => {
    return (quotations || []).filter(q => {
      const qDate = q.created_at ? q.created_at.split('T')[0] : (q.generated_date || TODAY_REF);
      return isDateInRange(qDate, activeRange);
    });
  }, [quotations, activeRange]);

  // Compute Card metrics (leads and statuses as single source of truth)
  const totalLeadsCount = filteredLeads.length;
  const newLeadsCount = filteredLeads.filter(l => l.status === 'New Lead').length;
  const followUpPendingCount = filteredLeads.filter(l => l.status === 'Follow Up' || l.status === 'Follow-Up' || l.status === 'Follow-up Pending').length;
  const quotationSentCount = filteredLeads.filter(l => l.status === 'Quotation Sent').length;
  const negotiationCount = filteredLeads.filter(l => l.status === 'Negotiation').length;
  const orderConfirmedCount = filteredLeads.filter(l => l.status === 'Order Confirmed' || l.status === 'Approved').length;
  const lostLeadsCount = filteredLeads.filter(l => l.status === 'Lost Lead' || l.status === 'Cancelled' || l.status === 'Lost').length;
  
  const conversionRateFloat = totalLeadsCount > 0 
    ? parseFloat(((orderConfirmedCount / totalLeadsCount) * 100).toFixed(1))
    : 0;

  const totalEventValue = filteredLeads
    .filter(l => l.status === 'Order Confirmed' || l.status === 'Approved')
    .reduce((sum, l) => sum + (l.budget || 0), 0);

  const upcomingEventsCount = filteredLeads
    .filter(l => (l.status === 'Order Confirmed' || l.status === 'Approved') && l.event_date >= TODAY_REF)
    .length;

  const salesTeam = staff.filter(s => s.role === 'Sales Team');
  
  const staffPerformance = useMemo(() => {
    const stats: Record<string, any> = {};
    salesTeam.forEach(s => {
      stats[s.staff_id] = {
        name: s.name,
        assigned: 0,
        contacted: 0,
        followUps: 0,
        converted: 0,
        lost: 0,
        revenue: 0,
        conversionRate: 0
      };
    });

    filteredLeads.forEach(l => {
      if (l.assigned_to && stats[l.assigned_to]) {
        const s = stats[l.assigned_to];
        s.assigned += 1;
        if (l.status !== 'New Lead') s.contacted += 1;
        if (['Follow Up', 'Follow-Up', 'Follow-up Pending'].includes(l.status)) s.followUps += 1;
        if (['Order Confirmed', 'Approved'].includes(l.status)) {
          s.converted += 1;
          s.revenue += (l.budget || 0);
        }
        if (['Lost Lead', 'Cancelled', 'Lost'].includes(l.status)) s.lost += 1;
      }
    });

    return Object.values(stats).map(s => {
      s.conversionRate = s.assigned > 0 ? parseFloat(((s.converted / s.assigned) * 100).toFixed(1)) : 0;
      return s;
    }).sort((a, b) => b.revenue - a.revenue);
  }, [filteredLeads, salesTeam]);

  // Construct chart dataset (grouped by date)
  const chartData = useMemo(() => {
    const datesMap: { [key: string]: { date: string; leads: number; orders: number } } = {};
    
    // Seed dates inside range
    const dStart = new Date(activeRange.start);
    const dEnd = new Date(activeRange.end);
    let curr = new Date(dStart);
    
    // limit graph seeds to safe 45 items maximum
    let iter = 0;
    while (curr <= dEnd && iter < 45) {
      const dStr = curr.toISOString().split('T')[0];
      datesMap[dStr] = { date: dStr.substring(5), leads: 0, orders: 0 };
      curr.setDate(curr.getDate() + 1);
      iter++;
    }

    filteredLeads.forEach(l => {
      const d = l.created_date.split('T')[0];
      if (datesMap[d]) datesMap[d].leads += 1;
    });

    filteredOrders.forEach(o => {
      const d = o.created_at ? o.created_at.split('T')[0] : o.event_date;
      if (datesMap[d]) datesMap[d].orders += 1;
    });

    return Object.values(datesMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredLeads, filteredOrders, activeRange]);

  return (
    <div className="space-y-6">
      
      {/* Title & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-black uppercase text-indigo-400 font-mono tracking-[0.18em]">
            Sales & CRM Desk Analytics
          </h2>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            CEO Command Room dashboard monitoring operational pipelines, conversion rate trends, and cash generation.
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
        </div>
      </div>

      {showFilters && (
        <div className="flex justify-end bg-zinc-950/20 border border-zinc-900 p-3 rounded-xl animate-in fade-in duration-200">
          <button
            onClick={() => setSelectedCard('Complete Sales Digest')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer h-9 shadow-md shadow-black/10"
          >
            <FileText className="w-4 h-4" />
            <span>Download Report</span>
          </button>
        </div>
      )}

      {/* Grid of 10 Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        
        <CameraLensStatsCard
          label="Total Leads"
          val={totalLeadsCount}
          theme="purple"
          trendText="Live Inflow Queue"
          subText="AF Active"
          chartPoints={[10, 15, 12, 19, 14, 25, 23]}
          onClick={() => setSelectedCard('Total Leads')}
          lensLabel="PRIME 24mm"
        />

        <CameraLensStatsCard
          label="New Leads"
          val={newLeadsCount}
          theme="blue"
          trendText="Pending Action"
          subText="AF Tracking"
          chartPoints={[5, 11, 7, 15, 12, 18, 14]}
          onClick={() => setSelectedCard('New Leads')}
          lensLabel="PRIME 35mm"
        />

        <CameraLensStatsCard
          label="Follow-up Pending"
          val={followUpPendingCount}
          theme="gold"
          trendText="Outreach Phase"
          subText="AF Continuous"
          chartPoints={[12, 8, 14, 11, 16, 12, 18]}
          onClick={() => setSelectedCard('Follow-up Pending')}
          lensLabel="PRIME 50mm"
        />

        <CameraLensStatsCard
          label="Quotation Sent"
          val={quotationSentCount}
          theme="cyan"
          trendText="Dispatched Logs"
          subText="AF Transmit"
          chartPoints={[8, 12, 9, 14, 11, 17, 15]}
          onClick={() => setSelectedCard('Quotation Sent')}
          lensLabel="TELE 135mm"
        />

        <CameraLensStatsCard
          label="Negotiation"
          val={negotiationCount}
          theme="orange"
          trendText="Bidding Discussions"
          subText="AF Manual"
          chartPoints={[4, 7, 5, 8, 6, 10, 9]}
          onClick={() => setSelectedCard('Negotiation')}
          lensLabel="ZOOM 24-70"
        />

        <CameraLensStatsCard
          label="Order Confirmed"
          val={orderConfirmedCount}
          theme="green"
          trendText="Contracts Signed"
          subText="AF Locked"
          chartPoints={[3, 6, 5, 9, 8, 11, 10]}
          onClick={() => setSelectedCard('Order Confirmed')}
          lensLabel="PRIME 16mm"
        />

        <CameraLensStatsCard
          label="Lost Leads"
          val={lostLeadsCount}
          theme="purple"
          trendText="Discarded Logs"
          subText="AF Close"
          chartPoints={[1, 3, 2, 4, 3, 5, 4]}
          onClick={() => setSelectedCard('Lost Leads')}
          lensLabel="TELE 200mm"
        />

        <CameraLensStatsCard
          label="Conversion Rate"
          val={conversionRateFloat}
          isPercentage={true}
          theme="cyan"
          trendText="Success Ratio"
          subText="AF Calibrated"
          chartPoints={[30, 35, 32, 40, 38, 45, 42]}
          onClick={() => setSelectedCard('Conversion Rate')}
          lensLabel="ZOOM 70-200"
        />

        <CameraLensStatsCard
          label="Total Event Value"
          val={totalEventValue}
          isCurrency={true}
          currencyFormatter={formatINR}
          theme="gold"
          trendText="Pipeline Locked"
          subText="AF Capital"
          chartPoints={[20, 35, 28, 45, 52, 60, 75]}
          onClick={() => setSelectedCard('Total Event Value')}
          lensLabel="CINE 35mm"
        />

        <CameraLensStatsCard
          label="Upcoming Events"
          val={upcomingEventsCount}
          theme="blue"
          trendText="Production Backlog"
          subText="AF Schedule"
          chartPoints={[2, 5, 4, 6, 8, 7, 11]}
          onClick={() => setSelectedCard('Upcoming Events')}
          lensLabel="PRIME 85mm"
        />

      </div>

      {/* Visual Recharts Section */}
      <div className="bg-zinc-950/50 border border-zinc-850 p-4 sm:p-5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <h4 className="text-xs font-black uppercase text-zinc-300 font-mono tracking-wider">
            Inflow Lead and Conversion Trend Line
          </h4>
        </div>
        
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818CF8" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
              <XAxis dataKey="date" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} tickLine={false} allowDecimals={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                itemStyle={{ fontSize: '11px' }}
              />
              <Legend verticalAlign="top" height={36} iconSize={10} style={{ fontSize: '10px' }} />
              <Area type="monotone" name="Inbound Leads" dataKey="leads" stroke="#818CF8" strokeWidth={2} fillOpacity={1} fill="url(#colorLeads)" />
              <Area type="monotone" name="Signed Orders" dataKey="orders" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Staff Performance & Ranking */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider">Sales Staff Performance Ranking</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase font-black text-zinc-500 font-mono tracking-wider">
                <th className="p-3">Rank</th>
                <th className="p-3">Staff Name</th>
                <th className="p-3 text-center">Assigned Leads</th>
                <th className="p-3 text-center">Contacted Leads</th>
                <th className="p-3 text-center">Follow-ups</th>
                <th className="p-3 text-center">Converted Leads</th>
                <th className="p-3 text-center">Lost Leads</th>
                <th className="p-3 text-right">Revenue Generated</th>
                <th className="p-3 text-right">Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {staffPerformance.map((st, idx) => (
                <tr key={idx} className="border-b border-zinc-800/50 text-xs text-zinc-300 font-mono hover:bg-zinc-900/50 transition-colors">
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-black font-bold ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-zinc-300' : idx === 2 ? 'bg-amber-700' : 'bg-transparent text-zinc-400 border border-zinc-700'}`}>
                      #{idx + 1}
                    </span>
                  </td>
                  <td className="p-3 text-white font-bold">{st.name}</td>
                  <td className="p-3 text-center">{st.assigned}</td>
                  <td className="p-3 text-center">{st.contacted}</td>
                  <td className="p-3 text-center">{st.followUps}</td>
                  <td className="p-3 text-center text-emerald-400">{st.converted}</td>
                  <td className="p-3 text-center text-rose-400">{st.lost}</td>
                  <td className="p-3 font-bold text-amber-400 text-right">{formatINR(st.revenue)}</td>
                  <td className="p-3 font-bold text-right">{st.conversionRate}%</td>
                </tr>
              ))}
              {staffPerformance.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-zinc-500 text-xs">No sales staff data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytics Drilldown Modal */}
      {selectedCard && (
        <AnalyticsReportModal
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
          reportTitle={`SALES DETAILED AUDIT: ${selectedCard.toUpperCase()}`}
          reportType="sales"
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
