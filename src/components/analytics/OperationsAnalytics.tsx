import React, { useState, useMemo } from 'react';
import { useRole } from '../RoleContext';
import { DatePreset, getPresetDateRange, isDateInRange, TODAY_REF, DateRange } from './DateFilterHelper';
import { DatePresetSelector } from './DatePresetSelector';
import { AnalyticsReportModal } from './AnalyticsReportModal';
import { 
  PlusSquare, Calendar, Users, CheckCircle, Video, Clock, AlertTriangle, Play,
  BarChart3, ChevronRight, TrendingUp, UserCheck, Activity, FileText, Download, 
  UserPlus, Search, Filter, Percent, Info, X
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Legend, Cell 
} from 'recharts';
import { jsPDF } from 'jspdf';
import { StaffAssignment } from '../../types';
import { CameraLensStatsCard } from '../CameraLensStatsCard';
import { formatDateDDMMYY } from '../../utils';

export const OperationsAnalytics: React.FC = () => {
  const { leads, orders, operations, rawFootage, payments, production, staff, globalDateRange, staffAssignments } = useRole();

  // Selected Card for Report Popup
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Staff Performance local states
  const [staffNameFilter, setStaffNameFilter] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('All');
  const [selectedStaffDetail, setSelectedStaffDetail] = useState<any | null>(null);
  const [activeStaffCardFilter, setActiveStaffCardFilter] = useState<string | null>(null);

  // Active Date Bounds are the global range from context
  const activeRange = globalDateRange;

  // Filtered dataset variables
  const filteredOrders = useMemo(() => {
    return orders.filter(o => isDateInRange(o.event_date, activeRange));
  }, [orders, activeRange]);

  // Compute Card Metrics
  const newOrdersCount = filteredOrders.filter(o => o.current_stage === 'New Order Received' || o.current_stage === 'Order Confirmed').length;
  
  const eventsScheduledCount = filteredOrders.filter(o => 
    o.current_stage === 'Event Scheduled' || o.current_stage === 'Operations Assigned'
  ).length;

  const staffAssignedCount = useMemo(() => {
    return filteredOrders.filter(o => {
      const op = operations.find(x => x.order_id === o.order_id);
      if (!op) return false;
      const assigned = [op.photographer_assigned, op.videographer_assigned, op.drone_operator_assigned];
      return assigned.some(name => name && name !== 'None' && name !== 'Unassigned');
    }).length;
  }, [filteredOrders, operations]);

  const eventsCompletedCount = filteredOrders.filter(o => 
    o.current_stage === 'Event Completed' || o.current_stage === 'Closed' || o.current_stage === 'Delivered'
  ).length;

  const rawFootageReceivedCount = useMemo(() => {
    return filteredOrders.filter(o => {
      const footage = (rawFootage || []).find(f => f.order_id === o.order_id);
      return (footage && footage.status === 'Received') || o.current_stage === 'Raw Footage Received';
    }).length;
  }, [filteredOrders, rawFootage]);

  const upcomingEventsCount = filteredOrders.filter(o => o.event_date >= TODAY_REF).length;
  const todaysEventsCount = filteredOrders.filter(o => o.event_date === TODAY_REF).length;
  
  const overdueEventsCount = filteredOrders.filter(o => 
    o.event_date < TODAY_REF && 
    o.current_stage !== 'Event Completed' && 
    o.current_stage !== 'Closed' && 
    o.current_stage !== 'Delivered'
  ).length;

  // Pie chart or Bar chart data for event types
  const eventTypeChartData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    filteredOrders.forEach(o => {
      counts[o.event_type] = (counts[o.event_type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
  }, [filteredOrders]);

  const COLORS = ['#818CF8', '#10B981', '#34D399', '#FB7185', '#F59E0B', '#A78BFA'];

  return (
    <div className="space-y-6">
      
      {/* Title & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-black uppercase text-indigo-400 font-mono tracking-[0.18em]">
            Operations Desk Analytics
          </h2>
          <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
            Logistical scheduling monitor, crew roster allocations, and photographic file asset intakes.
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
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-zinc-450 uppercase font-bold">
              Operations Live
            </span>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="flex justify-end bg-zinc-950/20 border border-zinc-900 p-3 rounded-xl animate-in fade-in duration-200">
          <button
            onClick={() => setSelectedCard('Complete Operations Digest')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer h-9 shadow-md shadow-black/10"
          >
            <FileText className="w-4 h-4" />
            <span>Download Report</span>
          </button>
        </div>
      )}

      {/* Operational 8 Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <CameraLensStatsCard
          label="Orders Received"
          val={newOrdersCount}
          theme="purple"
          trendText="Awaiting Allocation"
          onClick={() => setSelectedCard('New Orders Received')}
          lensLabel="PRIME 24mm"
        />

        <CameraLensStatsCard
          label="Events Scheduled"
          val={eventsScheduledCount}
          theme="blue"
          trendText="Logistics Calibrated"
          onClick={() => setSelectedCard('Events Scheduled')}
          lensLabel="PRIME 35mm"
        />

        <CameraLensStatsCard
          label="Staff Allocated"
          val={staffAssignedCount}
          theme="green"
          trendText="Crew Units Attached"
          onClick={() => setSelectedCard('Staff Assigned')}
          lensLabel="PRIME 50mm"
        />

        <CameraLensStatsCard
          label="Events Completed"
          val={eventsCompletedCount}
          theme="cyan"
          trendText="Shoots Closed"
          onClick={() => setSelectedCard('Events Completed')}
          lensLabel="PRIME 85mm"
        />

        <CameraLensStatsCard
          label="Raw Footage Intake"
          val={rawFootageReceivedCount}
          theme="purple"
          trendText="Files Ingestion Ledger"
          onClick={() => setSelectedCard('Raw Footage Received')}
          lensLabel="TELE 100mm"
        />

        <CameraLensStatsCard
          label="Upcoming Events"
          val={upcomingEventsCount}
          theme="blue"
          trendText="Logistics Forward View"
          onClick={() => setSelectedCard('Upcoming Events')}
          lensLabel="TELE 135mm"
        />

        <CameraLensStatsCard
          label="Today's Events"
          val={todaysEventsCount}
          theme="gold"
          trendText="Ongoing Shoot Calendars"
          onClick={() => setSelectedCard('Today\'s Events')}
          lensLabel="TELE 200mm"
        />

        <CameraLensStatsCard
          label="Overdue Shoots"
          val={overdueEventsCount}
          theme="red"
          trendText="Action Needed Immediately"
          onClick={() => setSelectedCard('Overdue Events')}
          lensLabel="TELE 400mm"
        />

      </div>

      {/* Visual Recharts Section */}
      <div className="bg-zinc-950/50 border border-zinc-850 p-4 sm:p-5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-black uppercase text-zinc-300 font-mono tracking-wider">
            Operational Event Types Distribution
          </h4>
        </div>
        
        <div className="h-[220px] w-full">
          {eventTypeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eventTypeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={9} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={9} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#18181b', opacity: 0.15 }}
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', fontSize: '11px', color: '#fff' }}
                  itemStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="value" name="Shoots Scheduled" fill="#6366F1" radius={[8, 8, 0, 0]} maxBarSize={45}>
                  {eventTypeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-550 border border-dashed border-zinc-850 rounded-xl font-sans italic text-xs">
              No active event types registered within this scope.
            </div>
          )}
        </div>
      </div>

      {/* OPERATIONS STAFF PERFORMANCE SECTION */}
      <div className="bg-zinc-950/50 border border-zinc-850 p-5 rounded-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-zinc-900">
          <div>
            <h3 className="text-sm font-black uppercase text-indigo-400 font-mono tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4" /> Operations Staff Performance
            </h3>
            <p className="text-[11px] text-zinc-500 font-sans mt-0.5">
              Live efficiency analytics, booking rates, completion speed, and workload rosters for ground crew.
            </p>
          </div>
          
          {/* Legend/Reset Filter if card filter active */}
          {activeStaffCardFilter && (
            <button 
              onClick={() => setActiveStaffCardFilter(null)}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-mono text-[10px] uppercase border border-indigo-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <X className="w-3" /> Clear Card Filter ({activeStaffCardFilter})
            </button>
          )}
        </div>

        {/* Dynamic Calculations for Operations Staff */}
        {(() => {
          // Identify Operations Staff members
          const opsStaff = staff.filter(s => {
            const depLower = (s.department || '').toLowerCase();
            const roleLower = (s.role || '').toLowerCase();
            return depLower === 'operations' || 
                   ['photographer', 'videographer', 'drone', 'assistant', 'crew', 'light', 'helper'].some(kw => roleLower.includes(kw) || depLower.includes(kw));
          });

          // Compile detailed performance statistics
          const staffPerformanceData = opsStaff.map(member => {
            // Find all direct bookings from staffAssignments table in range
            const directAssignments = staffAssignments.filter(sa => {
              const order = orders.find(o => o.order_id === sa.order_id);
              const opDate = sa.assignment_date || order?.event_date || '';
              return sa.staff_id === member.staff_id && isDateInRange(opDate, activeRange);
            });

            // Fallback: operations table records
            const opAssignments = operations.filter(op => {
              const order = orders.find(o => o.order_id === op.order_id);
              if (!order || !isDateInRange(order.event_date, activeRange)) return false;
              const isAssigned = op.photographer_assigned === member.name || 
                                 op.videographer_assigned === member.name || 
                                 op.drone_operator_assigned === member.name || 
                                 op.assistant_assigned === member.name;
              const alreadyHasDirect = directAssignments.some(da => da.order_id === op.order_id);
              return isAssigned && !alreadyHasDirect;
            }).map(op => {
              const order = orders.find(o => o.order_id === op.order_id)!;
              let roleStr = 'Assistant';
              if (op.photographer_assigned === member.name) roleStr = 'Photographer';
              else if (op.videographer_assigned === member.name) roleStr = 'Videographer';
              else if (op.drone_operator_assigned === member.name) roleStr = 'Drone Operator';

              return {
                assignment_id: `OP-${op.operation_id}-${member.staff_id}`,
                order_id: op.order_id,
                staff_role: roleStr,
                staff_id: member.staff_id,
                staff_name: member.name,
                assignment_date: order.event_date,
                assignment_status: ['Completed', 'Event Completed', 'Raw Footage Received'].includes(op.event_status || '') ? 'Completed' : 'Assigned',
              } as StaffAssignment;
            });

            const mergedAssignments = [...directAssignments, ...opAssignments];

            // Filter out duplicate order_ids just to be completely safe
            const uniqueAssignments = Array.from(new Map(mergedAssignments.map(a => [a.order_id, a])).values());

            // Active/Scheduled: event date >= Today and status is Assigned
            const scheduledCount = uniqueAssignments.filter(a => {
              const order = orders.find(o => o.order_id === a.order_id);
              const dt = a.assignment_date || order?.event_date || '';
              return a.assignment_status === 'Assigned' && dt >= TODAY_REF;
            }).length;

            // Completed events: explicitly marked completed, closed or delivered
            const completedCount = uniqueAssignments.filter(a => {
              const order = orders.find(o => o.order_id === a.order_id);
              const isOrderCompleted = order && ['Completed', 'Delivered', 'Paid', 'Closed', 'Raw Footage Received'].includes(order.current_stage || order.order_status);
              return a.assignment_status === 'Completed' || isOrderCompleted;
            }).length;

            // Ongoing events: event date is TODAY
            const ongoingCount = uniqueAssignments.filter(a => {
              const order = orders.find(o => o.order_id === a.order_id);
              const dt = a.assignment_date || order?.event_date || '';
              return a.assignment_status === 'Assigned' && dt === TODAY_REF;
            }).length;

            // Upcoming events
            const upcomingCount = uniqueAssignments.filter(a => {
              const order = orders.find(o => o.order_id === a.order_id);
              const dt = a.assignment_date || order?.event_date || '';
              return dt > TODAY_REF;
            }).length;

            // Overdue events: event date in past but still status Assigned/not done
            const overdueCount = uniqueAssignments.filter(a => {
              const order = orders.find(o => o.order_id === a.order_id);
              const dt = a.assignment_date || order?.event_date || '';
              const isDone = a.assignment_status === 'Completed' || 
                             (order && ['Completed', 'Delivered', 'Paid', 'Closed', 'Raw Footage Received'].includes(order.current_stage || order.order_status));
              return !isDone && dt && dt < TODAY_REF;
            }).length;

            const pendingCount = uniqueAssignments.length - completedCount;

            const completionRate = uniqueAssignments.length > 0 
              ? Math.round((completedCount / uniqueAssignments.length) * 100) 
              : 100;

            let revenueGenerated = 0;
            uniqueAssignments.forEach(a => {
              const order = orders.find(o => o.order_id === a.order_id);
              if (order && order.quotation_amount) {
                revenueGenerated += order.quotation_amount;
              }
            });

            const lastDate = uniqueAssignments.reduce((acc, a) => {
              const order = orders.find(o => o.order_id === a.order_id);
              const dt = a.assignment_date || order?.event_date || '';
              return dt > acc ? dt : acc;
            }, '');

            return {
              member,
              staff_id: member.staff_id,
              name: member.name,
              role: member.role || 'Crew Member',
              status: member.status || 'Active',
              email: member.email,
              mobile: member.mobile,
              assignedCount: uniqueAssignments.length,
              scheduledCount,
              completedCount,
              pendingCount,
              ongoingCount,
              upcomingCount,
              overdueCount,
              completionRate,
              rating: member.rating || 4.5,
              revenueGenerated,
              lastAssignedDate: lastDate || 'N/A',
              assignments: uniqueAssignments
            };
          });

          // Unique Roles list for filtering
          const uniqueRoles = Array.from(new Set(opsStaff.map(s => s.role).filter(Boolean)));

          // Compute KPI totals across all operations staff
          const totalStaffCount = opsStaff.length;
          const activeStaffCount = opsStaff.filter(s => s.status === 'Active').length;
          const totalOngoingTasks = staffPerformanceData.reduce((sum, s) => sum + s.ongoingCount, 0);
          const totalScheduledEvents = staffPerformanceData.reduce((sum, s) => sum + s.scheduledCount, 0);
          const totalCompletedEvents = staffPerformanceData.reduce((sum, s) => sum + s.completedCount, 0);
          const totalUpcomingEvents = staffPerformanceData.reduce((sum, s) => sum + s.upcomingCount, 0);
          const totalOverdueAssignments = staffPerformanceData.reduce((sum, s) => sum + s.overdueCount, 0);

          // Filtering the table based on search query, role selection and clickable cards
          const filteredStaffPerformance = staffPerformanceData.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(staffNameFilter.toLowerCase());
            const matchesRole = staffRoleFilter === 'All' || s.role === staffRoleFilter;
            
            // Sub-card quick filters
            if (activeStaffCardFilter === 'ActiveStaff') {
              return matchesSearch && matchesRole && s.status === 'Active';
            }
            if (activeStaffCardFilter === 'OngoingTasks') {
              return matchesSearch && matchesRole && s.ongoingCount > 0;
            }
            if (activeStaffCardFilter === 'ScheduledEvents') {
              return matchesSearch && matchesRole && s.scheduledCount > 0;
            }
            if (activeStaffCardFilter === 'CompletedEvents') {
              return matchesSearch && matchesRole && s.completedCount > 0;
            }
            if (activeStaffCardFilter === 'UpcomingEvents') {
              return matchesSearch && matchesRole && s.upcomingCount > 0;
            }
            if (activeStaffCardFilter === 'OverdueAssignments') {
              return matchesSearch && matchesRole && s.overdueCount > 0;
            }

            return matchesSearch && matchesRole;
          });

          // Report Downloading Utilities
          const downloadCSV = () => {
            const csvRows = [
              ['Staff Name', 'Staff Role', 'Status', 'Total Assigned Events', 'Scheduled Events', 'Completed Events', 'Pending Events', 'Ongoing Events', 'Completion Rate', 'Last Assigned Date'],
              ...filteredStaffPerformance.map(s => [
                s.name,
                s.role,
                s.status,
                s.assignedCount,
                s.scheduledCount,
                s.completedCount,
                s.pendingCount,
                s.ongoingCount,
                `${s.completionRate}%`,
                s.lastAssignedDate
              ])
            ];
            const csvString = '\uFEFF' + csvRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Operations_Staff_Performance_Report.csv`;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };

          const downloadExcel = () => {
            // XLS formatted CSV representing Microsoft Excel compatibility
            const xlsHeader = `sep=,\r\n`;
            const xlsRows = [
              ['Operations Crew Performance Audit Report'],
              [`Export Bounds: ${formatDateDDMMYY(activeRange.start)} through ${formatDateDDMMYY(activeRange.end)}`],
              [`Generated: ${formatDateDDMMYY(new Date())}`],
              [],
              ['Staff Name', 'Staff Role', 'Roster Status', 'Assigned Events', 'Scheduled Events', 'Completed Events', 'Pending Events', 'Ongoing Events', 'Completion Rate %', 'Last Booked Date'],
              ...filteredStaffPerformance.map(s => [
                s.name,
                s.role,
                s.status,
                s.assignedCount,
                s.scheduledCount,
                s.completedCount,
                s.pendingCount,
                s.ongoingCount,
                s.completionRate,
                s.lastAssignedDate
              ])
            ];
            const xlsString = xlsHeader + xlsRows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
            const blob = new Blob([xlsString], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Operations_Staff_Roster_Performance_${new Date().toISOString().split('T')[0]}.xls`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };

          const downloadPDF = () => {
            const doc = new jsPDF();
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('PHOTO CREW ERP - OPERATIONS STAFF AUDIT', 14, 20);
            
            doc.setFontSize(10);
            doc.setFont('Helvetica', 'normal');
            doc.text(`Roster Range: ${activeRange.start} to ${activeRange.end}`, 14, 26);
            doc.text(`Export Filter: Name="${staffNameFilter || 'Any'}", Role="${staffRoleFilter}"`, 14, 31);
            doc.text(`Total Staff Records: ${filteredStaffPerformance.length}`, 14, 36);

            doc.setDrawColor(200, 200, 200);
            doc.line(14, 42, 196, 42);

            let y = 50;
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            
            const cols = ['NAME', 'ROLE', 'ASSIGNED', 'SCHEDULED', 'COMPLETED', 'PENDING', 'ONGOING', 'RATE %'];
            cols.forEach((col, idx) => {
              doc.text(col, 14 + idx * 23, y);
            });

            doc.setFont('Helvetica', 'normal');
            y += 6;

            filteredStaffPerformance.slice(0, 30).forEach(s => {
              if (y > 275) {
                doc.addPage();
                y = 20;
              }
              doc.text(s.name.substring(0, 16), 14, y);
              doc.text(s.role.substring(0, 16), 14 + 23, y);
              doc.text(String(s.assignedCount), 14 + 46, y);
              doc.text(String(s.scheduledCount), 14 + 69, y);
              doc.text(String(s.completedCount), 14 + 92, y);
              doc.text(String(s.pendingCount), 14 + 115, y);
              doc.text(String(s.ongoingCount), 14 + 138, y);
              doc.text(`${s.completionRate}%`, 14 + 161, y);
              y += 7;
            });

            doc.save(`Operations_Staff_Audits_${new Date().toISOString().split('T')[0]}.pdf`);
          };

          return (
            <div className="space-y-6">
              {/* STAFF KPI CARDS GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:grid-cols-7 gap-3">
                
                {/* 1. Total Operations Staff */}
                <div 
                  onClick={() => setActiveStaffCardFilter(null)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === null 
                      ? 'bg-zinc-900/65 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.08)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-zinc-800'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Total Crew</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-white font-sans">{totalStaffCount}</h4>
                    <span className="text-[9px] text-zinc-500">Staff</span>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Rostered
                  </div>
                </div>

                {/* 2. Active Staff */}
                <div 
                  onClick={() => setActiveStaffCardFilter('ActiveStaff')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === 'ActiveStaff' 
                      ? 'bg-zinc-900/65 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.08)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-emerald-500/30'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Active Roster</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-emerald-450 font-sans">{activeStaffCount}</h4>
                    <span className="text-[9px] text-zinc-500">Ready</span>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Available
                  </div>
                </div>

                {/* 3. Ongoing Tasks */}
                <div 
                  onClick={() => setActiveStaffCardFilter('OngoingTasks')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === 'OngoingTasks' 
                      ? 'bg-zinc-900/65 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.08)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-amber-500/30'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Ongoing Today</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-amber-450 font-sans">{totalOngoingTasks}</h4>
                    <span className="text-[9px] text-zinc-500">Live</span>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    In Field
                  </div>
                </div>

                {/* 4. Scheduled Events */}
                <div 
                  onClick={() => setActiveStaffCardFilter('ScheduledEvents')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === 'ScheduledEvents' 
                      ? 'bg-zinc-900/65 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.08)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-blue-500/30'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Scheduled</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-blue-400 font-sans">{totalScheduledEvents}</h4>
                    <span className="text-[9px] text-zinc-500">Tasks</span>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Allocated
                  </div>
                </div>

                {/* 5. Completed Events */}
                <div 
                  onClick={() => setActiveStaffCardFilter('CompletedEvents')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === 'CompletedEvents' 
                      ? 'bg-zinc-900/65 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.08)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-teal-500/30'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Completed</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-teal-400 font-sans">{totalCompletedEvents}</h4>
                    <span className="text-[9px] text-zinc-500">Done</span>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                    File Sealed
                  </div>
                </div>

                {/* 6. Upcoming Events */}
                <div 
                  onClick={() => setActiveStaffCardFilter('UpcomingEvents')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === 'UpcomingEvents' 
                      ? 'bg-zinc-900/65 border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.08)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-purple-500/30'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Upcoming</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-purple-400 font-sans">{totalUpcomingEvents}</h4>
                    <span className="text-[9px] text-zinc-500">Shoots</span>
                  </div>
                  <div className="text-[8px] font-mono text-zinc-600 mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    Rostered
                  </div>
                </div>

                {/* 7. Overdue Assignments */}
                <div 
                  onClick={() => setActiveStaffCardFilter('OverdueAssignments')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    activeStaffCardFilter === 'OverdueAssignments' 
                      ? 'bg-zinc-900/65 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.1)]' 
                      : 'bg-zinc-950/40 border-zinc-900 hover:border-red-500/40'
                  }`}
                >
                  <span className="text-[9px] font-mono uppercase text-zinc-550 font-bold block">Overdue Shoot</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <h4 className="text-xl font-bold text-red-400 font-sans">{totalOverdueAssignments}</h4>
                    <span className="text-[9px] text-zinc-500">Delay</span>
                  </div>
                  <div className="text-[8px] font-mono text-rose-500/80 mt-2 flex items-center gap-1 font-bold animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Alert Lock
                  </div>
                </div>

              </div>

              {/* FILTRATION TOOLBAR */}
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-850 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                  
                  {/* Name Filter */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                    <input 
                      type="text"
                      placeholder="Filter staff by name..."
                      value={staffNameFilter}
                      onChange={(e) => setStaffNameFilter(e.target.value)}
                      className="w-full bg-[#08080a] border border-zinc-800 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-550 outline-none focus:border-indigo-500 transition-all font-sans"
                    />
                  </div>

                  {/* Role Selector */}
                  <div className="relative min-w-max">
                    <span className="absolute left-2.5 top-[11px] text-[9px] font-mono uppercase tracking-wider text-zinc-650 font-black">Role:</span>
                    <select
                      value={staffRoleFilter}
                      onChange={(e) => setStaffRoleFilter(e.target.value)}
                      className="w-full bg-[#08080a] border border-zinc-800 rounded-lg py-2 pl-12 pr-4 text-xs text-zinc-300 outline-none focus:border-indigo-500 transition-all cursor-pointer font-mono"
                    >
                      <option value="All">All Operations Roles</option>
                      {uniqueRoles.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Exporters Button Group */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500 mr-1 uppercase">Exports:</span>
                  <button 
                    onClick={downloadPDF}
                    className="p-2 py-1.5 bg-zinc-950/80 border border-zinc-800 hover:border-rose-500/40 text-rose-400 rounded-lg text-[10px] font-mono uppercase transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3 h-3" /> PDF
                  </button>
                  <button 
                    onClick={downloadExcel}
                    className="p-2 py-1.5 bg-zinc-950/80 border border-zinc-800 hover:border-emerald-500/40 text-emerald-400 rounded-lg text-[10px] font-mono uppercase transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" /> Excel
                  </button>
                  <button 
                    onClick={downloadCSV}
                    className="p-2 py-1.5 bg-zinc-950/80 border border-zinc-800 hover:border-indigo-500/40 text-indigo-400 rounded-lg text-[10px] font-mono uppercase transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Activity className="w-3 h-3" /> CSV
                  </button>
                </div>
              </div>

              {/* STAFF PERFORMANCE DATA TABLE */}
              <div className="overflow-x-auto border border-zinc-850/70 rounded-xl bg-zinc-950/40">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-zinc-950/70 text-zinc-400 font-mono text-[9px] uppercase tracking-wider">
                      <th className="py-3 px-4 font-black">Staff Member</th>
                      <th className="py-3 px-4 font-black">Roster Role</th>
                      <th className="py-3 px-4 font-black text-center">Total Ordered Events</th>
                      <th className="py-3 px-4 text-center text-emerald-400">Events Handled</th>
                      <th className="py-3 px-4 text-center text-amber-450">Rating</th>
                      <th className="py-3 px-4 text-right text-indigo-400">Revenue Generated</th>
                      <th className="py-3 px-4 text-right">Completion Rate %</th>
                      <th className="py-3 px-4 text-right">Last Booked Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {filteredStaffPerformance.length > 0 ? (
                      filteredStaffPerformance.map(s => (
                        <tr 
                          key={s.staff_id}
                          className="hover:bg-zinc-900/30 transition-colors group"
                        >
                          {/* Staff Name with click action */}
                          <td className="py-3 px-4">
                            <button 
                              onClick={() => setSelectedStaffDetail(s)}
                              className="text-white font-semibold hover:text-indigo-400 flex items-center gap-1.5 cursor-pointer text-left focus:outline-none"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-indigo-400 transition-colors" />
                              {s.name}
                              <Info className="w-3 h-3 text-zinc-650 opacity-0 group-hover:opacity-100 transition-all" />
                            </button>
                          </td>
                          
                          <td className="py-3 px-4 text-zinc-400 font-mono text-[10px]">{s.role}</td>
                          <td className="py-3 px-4 text-center font-bold text-white table-cell">{s.assignedCount}</td>
                          <td className="py-3 px-4 text-center font-semibold text-emerald-500">{s.completedCount}</td>
                          <td className="py-3 px-4 text-center font-semibold text-amber-500">{s.rating} ★</td>
                          <td className="py-3 px-4 text-right font-semibold text-indigo-400 font-mono">
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(s.revenueGenerated)}
                          </td>
                          
                          {/* Completion rate with small meter */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-mono font-bold text-white">{s.completionRate}%</span>
                              <div className="w-12 bg-zinc-900 rounded-full h-1 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    s.completionRate > 80 ? 'bg-emerald-500' :
                                    s.completionRate > 50 ? 'bg-indigo-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${s.completionRate}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right text-zinc-450 font-mono text-[10px]">{s.lastAssignedDate}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-zinc-550 italic">
                          No operations team members match the active bounds and query filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* STAFF DETAILS DRAWER / MODAL POPUP */}
              {selectedStaffDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
                  <div className="bg-zinc-950 border border-zinc-850 w-full w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                    
                    {/* Modal Header */}
                    <div className="p-5 border-b border-zinc-900 bg-zinc-900/60 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black block">Field Crew Dossier</span>
                          <h3 className="text-base font-black text-white font-sans">{selectedStaffDetail.name}</h3>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedStaffDetail(null)}
                        className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="p-5 overflow-y-auto space-y-6">
                      
                      {/* Grid Info Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-zinc-900/40 border border-zinc-900">
                        <div>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase block">Crew Roster Designation</span>
                          <span className="text-xs text-white font-semibold">{selectedStaffDetail.role}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase block">Roster Registration Stats</span>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                            selectedStaffDetail.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${selectedStaffDetail.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                            {selectedStaffDetail.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] font-mono text-zinc-500 uppercase block">Performance Rate %</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono font-black text-indigo-455">{selectedStaffDetail.completionRate}%</span>
                            <div className="w-16 bg-zinc-950 rounded-full h-1">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${selectedStaffDetail.completionRate}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-zinc-900 sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase block">Roster Email</span>
                            <span className="text-xs text-zinc-300 font-mono select-all break-all">{selectedStaffDetail.email || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase block">Roster Mobile</span>
                            <span className="text-xs text-zinc-300 font-mono select-all">{selectedStaffDetail.mobile || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      {/* STATS TRIPLETS */}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-xl bg-[#09090b] border border-zinc-900">
                          <span className="text-[9px] font-mono text-zinc-500 uppercase block">Assigned Shoots</span>
                          <h5 className="text-xl font-bold text-white mt-1 font-sans">{selectedStaffDetail.assignedCount}</h5>
                        </div>
                        <div className="p-3 rounded-xl bg-[#09090b] border border-zinc-900">
                          <span className="text-[9px] font-mono text-zinc-500 uppercase block">Completed Shoots</span>
                          <h5 className="text-xl font-bold text-emerald-450 mt-1 font-sans">{selectedStaffDetail.completedCount}</h5>
                        </div>
                        <div className="p-3 rounded-xl bg-[#09090b] border border-zinc-900">
                          <span className="text-[9px] font-mono text-zinc-500 uppercase block">Pending / Upcoming</span>
                          <h5 className="text-xl font-bold text-indigo-455 mt-1 font-sans">{selectedStaffDetail.pendingCount}</h5>
                        </div>
                      </div>

                      {/* UPCOMING EVENTS LIST */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-black">
                          Upcoming / Active Event Calendar Allocation
                        </h4>
                        <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                          {selectedStaffDetail.assignments.filter((a: any) => {
                            const order = orders.find(o => o.order_id === a.order_id);
                            return (a.assignment_date && a.assignment_date >= TODAY_REF) || (order && order.event_date >= TODAY_REF);
                          }).length > 0 ? (
                            selectedStaffDetail.assignments.filter((a: any) => {
                              const order = orders.find(o => o.order_id === a.order_id);
                              return (a.assignment_date && a.assignment_date >= TODAY_REF) || (order && order.event_date >= TODAY_REF);
                            }).map((a: any) => {
                              const order = orders.find(o => o.order_id === a.order_id);
                              return (
                                <div key={a.assignment_id} className="p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-850 flex items-center justify-between text-[11px] font-sans">
                                  <div>
                                    <span className="font-bold text-white block">{order?.customer_name || 'Client Event'}</span>
                                    <span className="text-zinc-500 text-[10px] font-mono">{a.order_id} • Assigned as {a.staff_role}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-zinc-300 font-mono text-[10px] block">{a.assignment_date || order?.event_date || 'Future'}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-500/10 text-indigo-400 uppercase font-mono">{order?.event_type || 'Shoot'}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-[11px] text-zinc-650 italic text-center py-2">No future events allocated within active roster scope.</p>
                          )}
                        </div>
                      </div>

                      {/* EVENT COMPLETION TIMELINE */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-black">
                          Event Allocation & Completion History Timeline
                        </h4>
                        <div className="border-l border-zinc-850 ml-3 pl-4 space-y-3.5 max-h-[180px] overflow-y-auto pr-1">
                          {selectedStaffDetail.assignments.length > 0 ? (
                            selectedStaffDetail.assignments.map((a: any) => {
                              const order = orders.find(o => o.order_id === a.order_id);
                              const isFinished = a.assignment_status === 'Completed' || (order && ['Completed', 'Delivered', 'Paid', 'Closed'].includes(order.current_stage || order.order_status));
                              return (
                                <div key={a.assignment_id} className="relative">
                                  {/* Timeline marker */}
                                  <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
                                    isFinished ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-indigo-500'
                                  }`} />
                                  <div className="text-[11px]">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-white">{order?.customer_name || 'Event Assignment'}</span>
                                      <span className={`text-[8px] uppercase px-1 rounded font-bold font-mono ${
                                        isFinished ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'
                                      }`}>
                                        {isFinished ? 'Sealed / Done' : 'Assigned (Active)'}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-zinc-500 block font-mono mt-0.5">
                                      Date: {a.assignment_date || order?.event_date || 'N/A'} • Role: {a.staff_role} • ID: {a.order_id}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-[11px] text-zinc-650 italic text-center py-2">No assignments to chart.</p>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-zinc-900 bg-zinc-950/80 text-right">
                      <button 
                        onClick={() => setSelectedStaffDetail(null)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Acknowledge
                      </button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          );
        })()}
      </div>

      {/* Analytics Drilldown Modal */}
      {selectedCard && (
        <AnalyticsReportModal
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
          reportTitle={`OPERATIONS LOGICAL REPORT: ${selectedCard.toUpperCase()}`}
          reportType="operations"
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
