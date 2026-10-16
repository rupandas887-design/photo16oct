import React, { useMemo } from 'react';
import { useRole } from '../../RoleContext';
import { 
  Briefcase, Calendar, CheckCircle, Clock, AlertCircle, Users, Camera, TrendingUp, BarChart3, 
  PieChart as PieChartIcon, MapPin, Package, Shield, UserCheck
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { CameraLensStatsCard } from '../../CameraLensStatsCard';
import { formatDateDDMMYY } from '../../../utils';

export const OwnerOperationsDetailed: React.FC = () => {
  const { orders, operations, staff } = useRole();

  const metrics = useMemo(() => {
    const scheduledEvents = orders.length;
    const completedEvents = orders.filter(o => o.current_stage === 'Completed' || o.order_status === 'Delivered').length;
    const upcomingEvents = orders.filter(o => new Date(o.event_date) >= new Date()).length;
    
    // Calculate assignments from operations table if possible, or dummy for now
    const pendingAssignments = orders.filter(o => !operations.find(op => op.order_id === o.order_id)).length;
    
    const completionRate = scheduledEvents > 0 ? ((completedEvents / scheduledEvents) * 100).toFixed(1) : '0';

    return {
      scheduledEvents,
      completedEvents,
      upcomingEvents,
      pendingAssignments,
      completionRate
    };
  }, [orders, operations]);

  // Events by Month
  const eventsByMonthData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map(m => ({ name: m, events: 0 }));
    orders.forEach(o => {
      if (!o.event_date) return;
      const date = new Date(o.event_date);
      const year = date.getFullYear();
      if (!isNaN(year) && year === new Date().getFullYear()) {
        const monthIndex = date.getMonth();
        if (!isNaN(monthIndex) && data[monthIndex]) {
          data[monthIndex].events++;
        }
      }
    });
    return data;
  }, [orders]);

  // Events by Event Type
  const eventsByTypeData = useMemo(() => {
    const types: Record<string, number> = {};
    orders.forEach(o => {
      const type = o.event_type || 'Other';
      types[type] = (types[type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [orders]);

  // Staff Workload (Active Assignments)
  const staffWorkloadData = useMemo(() => {
    const workload: Record<string, number> = {};
    operations.forEach(op => {
      // Assuming op has staff names or IDs. If op.staff_assignments is an array
      if (Array.isArray(op.staff_assignments)) {
        op.staff_assignments.forEach((s: any) => {
          const name = s.staff_name || 'Staff Member';
          workload[name] = (workload[name] || 0) + 1;
        });
      }
    });
    return Object.entries(workload).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [operations]);

  const COLORS = ['#10B981', '#6366F1', '#F59E0B', '#EF4444', '#A78BFA', '#F472B6', '#2DD4BF', '#FACC15'];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CameraLensStatsCard
          label="Scheduled Events"
          val={metrics.scheduledEvents}
          theme="blue"
          trendText="Total Projects"
          lensLabel="PRIME 24mm"
        />
        <CameraLensStatsCard
          label="Completed Events"
          val={metrics.completedEvents}
          theme="green"
          trendText="Successfully Executed"
          lensLabel="PRIME 35mm"
        />
        <CameraLensStatsCard
          label="Upcoming Events"
          val={metrics.upcomingEvents}
          theme="amber"
          trendText="Next 30 Days"
          lensLabel="PRIME 50mm"
        />
        <CameraLensStatsCard
          label="Completion Rate"
          val={metrics.completionRate}
          isPercentage={true}
          theme="emerald"
          trendText="Operational Efficiency"
          lensLabel="PRIME 85mm"
        />
        <CameraLensStatsCard
          label="Pending Assignments"
          val={metrics.pendingAssignments}
          theme="red"
          trendText="Staffing Required"
          lensLabel="TELE 100mm"
        />
        <CameraLensStatsCard
          label="Total Staff Members"
          val={staff.length}
          theme="purple"
          trendText="Active Resource Pool"
          lensLabel="TELE 135mm"
        />
        <CameraLensStatsCard
          label="Equipment Kits"
          val={8} // Static for now as equipment table is not direct
          theme="cyan"
          trendText="In Inventory"
          lensLabel="TELE 200mm"
        />
        <CameraLensStatsCard
          label="Delayed Logistics"
          val={2}
          theme="orange"
          trendText="Attention Needed"
          lensLabel="CINE 35mm"
        />
      </div>

      {/* Charts Section 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Monthly Event Load
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={eventsByMonthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="events" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorEvents)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-purple-400" /> Events by Category
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={eventsByTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {eventsByTypeData.map((entry, index) => (
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
        <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-400" /> Top Operations Staff Workload (Active Projects)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffWorkloadData} margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '12px' }} />
                <Bar dataKey="value" name="Active Assignments" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tables Section */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-850 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-500" /> Upcoming Operations Map
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead>
              <tr className="bg-zinc-900/50 text-zinc-450 font-mono text-[10px] uppercase tracking-wider">
                <th className="p-4">Event Date</th>
                <th className="p-4">Customer Name</th>
                <th className="p-4">Location</th>
                <th className="p-4">Event Type</th>
                <th className="p-4">Staff Count</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {orders.filter(o => new Date(o.event_date) >= new Date()).slice(0, 10).map((o, idx) => {
                const op = operations.find(ops => ops.order_id === o.order_id);
                return (
                  <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="p-4 text-zinc-400 font-mono">{formatDateDDMMYY(o.event_date)}</td>
                    <td className="p-4 font-bold text-zinc-100">{o.customer_name}</td>
                    <td className="p-4 text-zinc-400 italic truncate max-w-[200px]">{o.event_location || 'N/A'}</td>
                    <td className="p-4 text-zinc-300">{o.event_type}</td>
                    <td className="p-4 text-zinc-200 text-center font-mono">{op?.staff_assignments?.length || 0}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        o.current_stage === 'Completed' ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {o.current_stage}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {orders.filter(o => new Date(o.event_date) >= new Date()).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-zinc-500 italic">No upcoming events detected in mission control.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
