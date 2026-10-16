import React, { useMemo } from 'react';
import { useRole } from '../../RoleContext';
import { 
  Video, Calendar, CheckCircle, Clock, AlertCircle, Users, BarChart3, 
  PieChart as PieChartIcon, TrendingUp, Layers, PenTool, ClipboardCheck, Truck, ArrowRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, BarChart, Bar, Cell, PieChart, Pie, LineChart, Line
} from 'recharts';
import { CameraLensStatsCard } from '../../CameraLensStatsCard';
import { formatDateDDMMYY } from '../../../utils';

export const OwnerProductionDetailed: React.FC = () => {
  const { production } = useRole();

  const metrics = useMemo(() => {
    const totalProjects = production.length;
    const editingInProgress = production.filter(p => p.editing_status === 'In Progress').length;
    const internalQC = production.filter(p => p.editing_status === 'Internal QC Review').length;
    const clientReview = production.filter(p => p.editing_status === 'Client Review Sent').length;
    const revisionRequired = production.filter(p => p.editing_status === 'Revision Required').length;
    const projectDelivered = production.filter(p => p.editing_status === 'Project Delivered' || p.editing_status === 'Completed').length;
    
    // On-time delivery vs Delayed
    const onTime = production.filter(p => {
      if (!p.expected_delivery_date) return true;
      if (['Project Delivered', 'Completed'].includes(p.editing_status)) {
        return true; // Simple logic: if delivered, assume it was on time for now, or compare with delivery_date if existed
      }
      return new Date(p.expected_delivery_date) >= new Date();
    }).length;
    const delayed = totalProjects - onTime;

    return {
      totalProjects,
      editingInProgress,
      internalQC,
      clientReview,
      revisionRequired,
      projectDelivered,
      onTime,
      delayed
    };
  }, [production]);

  // Monthly Production Trend
  const monthlyProductionData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map(m => ({ name: m, projects: 0 }));
    production.forEach(p => {
      const date = p.created_at ? new Date(p.created_at) : new Date();
      const year = date.getFullYear();
      if (!isNaN(year) && year === new Date().getFullYear()) {
        const monthIndex = date.getMonth();
        if (!isNaN(monthIndex) && data[monthIndex]) {
          data[monthIndex].projects++;
        }
      }
    });
    return data;
  }, [production]);

  // Editor Performance (Projects by Editor)
  const editorPerformanceData = useMemo(() => {
    const performance: Record<string, number> = {};
    production.forEach(p => {
      const editor = p.editor_assigned || 'Unassigned';
      performance[editor] = (performance[editor] || 0) + 1;
    });
    return Object.entries(performance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [production]);

  // Editing Status Distribution
  const statusDistributionData = useMemo(() => {
    const statuses: Record<string, number> = {};
    production.forEach(p => {
      const status = p.editing_status || 'Pending';
      statuses[status] = (statuses[status] || 0) + 1;
    });
    return Object.entries(statuses).map(([name, value]) => ({ name, value }));
  }, [production]);

  const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#A78BFA', '#F472B6', '#2DD4BF', '#FACC15'];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CameraLensStatsCard
          label="Total Production Projects"
          val={metrics.totalProjects}
          theme="indigo"
          trendText="Active Pipeline"
          lensLabel="PRIME 24mm"
        />
        <CameraLensStatsCard
          label="Editing In Progress"
          val={metrics.editingInProgress}
          theme="blue"
          trendText="Work in Motion"
          lensLabel="PRIME 35mm"
        />
        <CameraLensStatsCard
          label="Internal QC Review"
          val={metrics.internalQC}
          theme="cyan"
          trendText="Quality Assurance"
          lensLabel="PRIME 50mm"
        />
        <CameraLensStatsCard
          label="Client Review Sent"
          val={metrics.clientReview}
          theme="purple"
          trendText="Awaiting Approval"
          lensLabel="PRIME 85mm"
        />
        <CameraLensStatsCard
          label="Revision Required"
          val={metrics.revisionRequired}
          theme="orange"
          trendText="Correction Loops"
          lensLabel="TELE 100mm"
        />
        <CameraLensStatsCard
          label="Project Delivered"
          val={metrics.projectDelivered}
          theme="emerald"
          trendText="Total Completion"
          lensLabel="TELE 135mm"
        />
        <CameraLensStatsCard
          label="On-time Delivery"
          val={metrics.onTime}
          theme="green"
          trendText="Contract Compliance"
          lensLabel="TELE 200mm"
        />
        <CameraLensStatsCard
          label="Delayed Projects"
          val={metrics.delayed}
          theme="red"
          trendText="Critical Backlog"
          lensLabel="CINE 35mm"
        />
      </div>

      {/* Charts Section 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Monthly Production Volume
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyProductionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorProjects" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="projects" stroke="#6366F1" strokeWidth={2} fillOpacity={1} fill="url(#colorProjects)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" /> Workflow Status Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusDistributionData.map((entry, index) => (
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

      {/* Editor Performance */}
      <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
          <PenTool className="w-4 h-4 text-amber-500" /> Editor Performance & Capacity
        </h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={editorPerformanceData} margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
              <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
              <Bar dataKey="value" name="Projects Handled" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tables Section */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-500" /> Active Production Tracker
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead>
              <tr className="bg-zinc-900/50 text-zinc-450 font-mono text-[10px] uppercase tracking-wider">
                <th className="p-4">Expected Delivery</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Editor</th>
                <th className="p-4">Status</th>
                <th className="p-4">Priority</th>
                <th className="p-4">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {production.slice(0, 10).map((p, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-4 text-zinc-400 font-mono">{p.expected_delivery_date ? formatDateDDMMYY(p.expected_delivery_date) : 'TBD'}</td>
                  <td className="p-4 font-bold text-zinc-100">{p.customer_name}</td>
                  <td className="p-4 text-zinc-300 italic">{p.editor_assigned || 'Awaiting Assignment'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.editing_status === 'Project Delivered' ? 'bg-emerald-500/10 text-emerald-500' :
                      p.editing_status === 'In Progress' ? 'bg-indigo-500/10 text-indigo-500' :
                      'bg-amber-500/10 text-amber-500'
                    }`}>
                      {p.editing_status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.priority === 'High' ? 'text-rose-500 border border-rose-500/30' :
                      p.priority === 'Medium' ? 'text-amber-500 border border-amber-500/30' :
                      'text-zinc-500 border border-zinc-500/30'
                    }`}>
                      {p.priority || 'Low'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500" 
                          style={{ width: `${p.completion_percentage || 0}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500">{p.completion_percentage || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {production.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-zinc-500 italic">No production projects detected in editing suite.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
