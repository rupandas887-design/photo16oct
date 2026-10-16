import React, { useMemo } from 'react';
import { useRole } from '../../RoleContext';
import { formatINR, formatDateDDMMYY } from '../../../utils';
import { 
  Users, Target, CheckCircle, XCircle, TrendingUp, BarChart3, 
  PieChart as PieChartIcon, Calendar, ArrowUpRight, ArrowDownRight, User, Filter, HelpCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, BarChart, Bar, Cell, PieChart, Pie, LineChart, Line
} from 'recharts';
import { CameraLensStatsCard } from '../../CameraLensStatsCard';

export const OwnerSalesDetailed: React.FC = () => {
  const { leads, orders, quotations } = useRole();

  const metrics = useMemo(() => {
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => ['Contacted', 'Follow-up', 'Quotation Sent', 'Negotiation', 'Order Confirmed', 'Approved'].includes(l.status)).length;
    const quotationsSent = leads.filter(l => l.status === 'Quotation Sent').length;
    const confirmedOrders = orders.length;
    const lostLeads = leads.filter(l => l.status === 'Lost').length;
    const pendingFollowups = leads.filter(l => l.status === 'Follow-up').length;
    const convertedLeads = orders.length;
    const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';
    const averageDealValue = confirmedOrders > 0 ? (orders.reduce((sum, o) => sum + (o.quotation_amount || 0), 0) / confirmedOrders) : 0;

    return {
      totalLeads,
      qualifiedLeads,
      quotationsSent,
      confirmedOrders,
      lostLeads,
      pendingFollowups,
      convertedLeads,
      conversionRate,
      averageDealValue
    };
  }, [leads, orders]);

  // Chart Data: Lead Source
  const leadSourceData = useMemo(() => {
    const sources: Record<string, number> = {};
    leads.forEach(l => {
      const source = l.source || 'Other';
      sources[source] = (sources[source] || 0) + 1;
    });
    return Object.entries(sources).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Chart Data: Lead Status
  const leadStatusData = useMemo(() => {
    const statuses: Record<string, number> = {};
    leads.forEach(l => {
      const status = l.status || 'New Lead';
      statuses[status] = (statuses[status] || 0) + 1;
    });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Monthly Lead Inflow
  const monthlyLeadsData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map(m => ({ name: m, leads: 0 }));
    leads.forEach(l => {
      if (!l.created_date) return;
      const date = new Date(l.created_date);
      const year = date.getFullYear();
      if (!isNaN(year) && year === new Date().getFullYear()) {
        const monthIndex = date.getMonth();
        if (!isNaN(monthIndex) && data[monthIndex]) {
          data[monthIndex].leads++;
        }
      }
    });
    return data;
  }, [leads]);

  // Revenue by Sales Person
  const revenueBySalesPerson = useMemo(() => {
    const persons: Record<string, number> = {};
    orders.forEach(o => {
      const person = o.assigned_to_name || 'Unassigned';
      persons[person] = (persons[person] || 0) + (o.quotation_amount || 0);
    });
    return Object.entries(persons).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [orders]);

  const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#A78BFA', '#F472B6', '#2DD4BF', '#FACC15'];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CameraLensStatsCard
          label="Total Leads"
          val={metrics.totalLeads}
          theme="indigo"
          trendText="Across All Channels"
          lensLabel="PRIME 24mm"
        />
        <CameraLensStatsCard
          label="Qualified Leads"
          val={metrics.qualifiedLeads}
          theme="emerald"
          trendText="High Interest"
          lensLabel="PRIME 35mm"
        />
        <CameraLensStatsCard
          label="Quotations Sent"
          val={metrics.quotationsSent}
          theme="amber"
          trendText="Awaiting Approval"
          lensLabel="PRIME 50mm"
        />
        <CameraLensStatsCard
          label="Confirmed Orders"
          val={metrics.confirmedOrders}
          theme="gold"
          trendText="Locked Contracts"
          lensLabel="PRIME 85mm"
        />
        <CameraLensStatsCard
          label="Conversion Rate"
          val={metrics.conversionRate}
          isPercentage={true}
          theme="green"
          trendText="Efficiency Index"
          lensLabel="TELE 100mm"
        />
        <CameraLensStatsCard
          label="Average Deal Value"
          val={metrics.averageDealValue}
          isCurrency={true}
          currencyFormatter={formatINR}
          theme="cyan"
          trendText="Per Confirmed Order"
          lensLabel="TELE 135mm"
        />
        <CameraLensStatsCard
          label="Lost Leads"
          val={metrics.lostLeads}
          theme="red"
          trendText="Total Attrition"
          lensLabel="TELE 200mm"
        />
        <CameraLensStatsCard
          label="Pending Follow-ups"
          val={metrics.pendingFollowups}
          theme="orange"
          trendText="Active Pipeline"
          lensLabel="CINE 35mm"
        />
      </div>

      {/* Charts Section 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-emerald-400" /> Lead Source Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leadSourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {leadSourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" /> Lead Status Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leadStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {leadStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Section 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500" /> Monthly Lead Inflow
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyLeadsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Bar dataKey="leads" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-cyan-400" /> Revenue by Sales Person
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueBySalesPerson} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} horizontal={false} />
                <XAxis type="number" stroke="#71717a" fontSize={10} tickLine={false} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(val: number) => [formatINR(val), 'Revenue']}
                />
                <Bar dataKey="value" fill="#22D3EE" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-500" /> Recent Leads & Orders
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead>
              <tr className="bg-zinc-900/50 text-zinc-450 font-mono text-[10px] uppercase tracking-wider">
                <th className="p-4">Date</th>
                <th className="p-4">Customer Name</th>
                <th className="p-4">Event Date</th>
                <th className="p-4">Assigned To</th>
                <th className="p-4">Status</th>
                <th className="p-4">Est. Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {leads.slice(0, 10).map((l, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-4 text-zinc-400 font-mono">
                    {l.created_date && !isNaN(new Date(l.created_date).getTime()) 
                      ? formatDateDDMMYY(l.created_date) 
                      : 'N/A'}
                  </td>
                  <td className="p-4 font-bold text-zinc-100">{l.customer_name}</td>
                  <td className="p-4 text-zinc-400 font-mono">
                    {l.event_date && !isNaN(new Date(l.event_date).getTime()) 
                      ? formatDateDDMMYY(l.event_date) 
                      : 'N/A'}
                  </td>
                  <td className="p-4 text-zinc-300 italic">{l.assigned_to_name || 'Unassigned'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      l.status === 'Order Confirmed' ? 'bg-emerald-500/10 text-emerald-500' :
                      l.status === 'Lost' ? 'bg-rose-500/10 text-rose-500' :
                      'bg-indigo-500/10 text-indigo-500'
                    }`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="p-4 text-zinc-200 font-mono">{formatINR(l.budget || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
