import React, { useState, useMemo } from 'react';
import { useRole } from '../RoleContext';
import { 
  Users, Shield, Calendar, AlertTriangle, CheckCircle, RefreshCw, Briefcase, Sparkles, Phone, Clock
} from 'lucide-react';
import { formatDateDDMMYY, formatTime12Hour } from '../../utils';

export const TeamAssignments: React.FC = () => {
  const { currentRole, orders, operations, staff, staffAssignments } = useRole();

  // Find assigned details if any
  const getOpDetails = (orderId: string) => {
    return operations.find((o) => o.order_id === orderId);
  };

  // Consolidated Roster rows
  const consolidatedRoster = useMemo(() => {
    const list: {
      id: string;
      role: string;
      name: string;
      mobile: string;
      assignDate: string;
      reportingTime: string;
      eventDate: string;
      status: string;
    }[] = [];

    // 1. Load from legacy single-role operations table (if assigned)
    operations.forEach(op => {
      const order = orders.find(o => o.order_id === op.order_id);
      if (!order) return;

      const addRow = (role: string, name: string) => {
        if (!name || name === 'None' || name.toLowerCase() === 'unassigned') return;
        const staffMember = staff.find(s => s.name === name);
        const mobile = staffMember?.phone || staffMember?.mobile || '—';
        list.push({
          id: `${op.order_id}-${role}`,
          role,
          name,
          mobile,
          assignDate: order.created_at ? order.created_at.split('T')[0] : order.event_date || '—',
          reportingTime: op.reporting_time || '—',
          eventDate: order.event_date || '—',
          status: op.event_status === 'Completed' ? 'Completed' : 'Assigned'
        });
      };

      addRow('Lead Photographer', op.photographer_assigned);
      addRow('Lead Videographer', op.videographer_assigned);
      addRow('Drone & Aerial Operator', op.drone_operator_assigned);
      addRow('Production Assistant', op.assistant_assigned);
    });

    // 2. Load from staffAssignments array (multi-roles)
    const saArray = staffAssignments || [];
    saArray.forEach(sa => {
      const itemKey = sa.assignment_id || `${sa.order_id}-${sa.staff_role}-${sa.staff_name}`;
      // Avoid duplication with above if we already listed exact same staff member for this order role
      if (list.some(r => r.id === itemKey || (r.name.toLowerCase() === (sa.staff_name || '').toLowerCase() && r.role.toLowerCase() === (sa.staff_role || '').toLowerCase() && r.id.startsWith(sa.order_id)))) return;

      const order = orders.find(o => o.order_id === sa.order_id);
      const op = operations.find(o => o.order_id === sa.order_id);
      const staffMember = staff.find(s => s.staff_id === sa.staff_id || s.name === sa.staff_name);
      
      list.push({
        id: itemKey,
        role: sa.staff_role,
        name: sa.staff_name,
        mobile: staffMember?.phone || staffMember?.mobile || '—',
        assignDate: sa.assignment_date || '—',
        reportingTime: op?.reporting_time || '—',
        eventDate: order?.event_date || '—',
        status: sa.assignment_status || 'Assigned'
      });
    });

    // Sort by event date
    return list.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [operations, orders, staff, staffAssignments]);

  // Extract all active operations projects
  const activeOps = operations.filter(op => op.event_status !== 'Completed');

  // Let's check for visual booking overlaps or double bookings!
  // Same operator, same date
  const operatorSchedule: Record<string, string[]> = {};
  const doubleBookings: string[] = [];

  activeOps.forEach(op => {
    const order = orders.find(o => o.order_id === op.order_id);
    if (!order) return;
    const date = order.event_date;
    
    const assignedPeople = [
      op.photographer_assigned, 
      op.videographer_assigned, 
      op.drone_operator_assigned, 
      op.assistant_assigned
    ].filter(p => p && p !== 'None');

    assignedPeople.forEach(person => {
      const key = `${person}-${date}`;
      if (operatorSchedule[key]) {
        operatorSchedule[key].push(op.order_id);
        if (!doubleBookings.includes(person)) {
          doubleBookings.push(person);
        }
      } else {
        operatorSchedule[key] = [op.order_id];
      }
    });
  });

  return (
    <div className="space-y-6">
      {/* Dynamic double booking warning banner if any conflicts actually exist */}
      {doubleBookings.length > 0 ? (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-start gap-3 animate-pulse">
          <AlertTriangle className="w-5 h-5 text-rose-450 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-rose-400 font-mono uppercase tracking-wider">DOUBLE-BOOKING DETECTED</h4>
            <p className="text-[11px] text-rose-500/80 mt-1">
              Cross-examination of rosters indicates scheduling conflicts. The following crew members are allocated to multiple shoots on the exact same calendar day: **{doubleBookings.join(', ')}**. Audit allocations in the roster board below.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-zinc-300">
            <strong className="text-zinc-100 font-mono">SCHEDULING RESOLVED:</strong> All field photographer, videographer, drone, and helper schedules are fully integrated, conflict-free, and locked for on-site operations.
          </div>
        </div>
      )}

      {/* Main interactive Board of team assignments */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Active Grid of assignments - Left */}
        <div className="xl:col-span-8 bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-xs font-mono font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-850 pb-2.5">
            <Shield className="w-4 h-4 text-amber-500" />
            <span>ACTIVE OPERATIONS PROJECT ASSIGNMENTS BOARD</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOps.length > 0 ? (
              activeOps.map((op) => {
                const order = orders.find(o => o.order_id === op.order_id);
                if (!order) return null;

                return (
                  <div key={op.id} className="p-4 bg-zinc-950/50 border border-zinc-850 rounded-xl space-y-3 hover:border-zinc-800 transition-all">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                      <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-bold text-indigo-400">
                        {op.order_id}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">{formatDateDDMMYY(order.event_date)}</span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-zinc-100">{order.customer_name}</h4>
                      <p className="text-[10px] text-zinc-450 uppercase font-mono">{order.event_type} - {order.event_location}</p>
                    </div>

                    <div className="space-y-1.5 pt-1 text-xs">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-455 font-mono">Operations Squad</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-300 font-mono text-[11px] bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-850/40">
                        <div className="space-y-0.5">
                          <div className="text-[9px] text-zinc-500 font-bold">📸 PHOTO</div>
                          <div className="break-words font-sans font-bold text-zinc-200">{op.photographer_assigned}</div>
                        </div>
                        <div className="space-y-0.5 border-l border-zinc-850/40 pl-2">
                          <div className="text-[9px] text-zinc-500 font-bold">🎥 VIDEO</div>
                          <div className="break-words font-sans font-bold text-zinc-200">{op.videographer_assigned}</div>
                        </div>
                        {op.drone_operator_assigned !== 'None' && op.drone_operator_assigned && (
                          <div className="col-span-2 border-t border-zinc-850/40 pt-1.5 space-y-0.5">
                            <div className="text-[9px] text-zinc-500 font-bold">🛸 AERIAL PILOT</div>
                            <div className="break-words font-sans font-bold text-zinc-200">{op.drone_operator_assigned}</div>
                          </div>
                        )}
                        {op.assistant_assigned !== 'None' && op.assistant_assigned && (
                          <div className="col-span-2 border-t border-zinc-850/40 pt-1.5 space-y-0.5">
                            <div className="text-[9px] text-zinc-500 font-bold">🤝 OPERATIONS ASSISTANT</div>
                            <div className="break-words font-sans font-bold text-zinc-200">{op.assistant_assigned}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="font-mono text-[10px] text-zinc-400 pt-1">
                      <div className="text-[9px] uppercase tracking-wider text-zinc-455 font-bold mb-1 font-sans">🛠️ Assigned Gear:</div>
                      {op.equipment_kit ? (
                        <div className="flex flex-wrap gap-1">
                          {op.equipment_kit.split(',').map((kit: string, idx: number) => (
                            <span key={idx} className="bg-amber-400/10 text-amber-300 px-1.5 py-0.5 border border-amber-400/10 rounded text-[9.5px] font-mono ">
                              {kit.trim()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-550 italic">No specific kits assigned.</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 p-10 text-center font-mono text-zinc-550 text-xs">
                No active projects requiring active assignments at the moment.
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Roster Load Monitor - Right */}
        <div className="xl:col-span-4 bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="text-xs font-mono font-black text-zinc-350 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-850 pb-2.5">
            <Users className="w-4 h-4 text-amber-500" />
            <span>OPERATIVE CAPACITY ANALYSIS</span>
          </h3>

          <div className="space-y-3.5 divide-y divide-zinc-850/60 max-h-[400px] overflow-y-auto pr-1">
            {staff.map((st) => {
              // Count bookings
              const assignedCount = operations.filter(o => 
                (o.photographer_assigned === st.name || 
                 o.videographer_assigned === st.name || 
                 o.drone_operator_assigned === st.name || 
                 o.assistant_assigned === st.name) && 
                o.event_status !== 'Completed'
              ).length;

              return (
                <div key={st.staff_id} className="pt-3 first:pt-0 flex items-center justify-between text-xs font-mono">
                  <div>
                    <div className="font-bold text-zinc-200 font-sans">{st.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{st.role}</div>
                  </div>

                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      assignedCount >= 2 
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                        : assignedCount === 1 
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                        : 'bg-zinc-950 text-zinc-450 border border-zinc-850'
                    }`}>
                      {assignedCount === 0 ? 'Benched' : `${assignedCount} shoot`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* COMPREHENSIVE STAFF ASSIGNMENT TABLE */}
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-mono font-black text-zinc-330 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-85" style={{ paddingBottom: '10px' }}>
          <Briefcase className="w-4 h-4 text-purple-405" />
          <span>STAFF ASSIGNMENT REGISTRY & ROSTER STATUS</span>
        </h3>

        <div className="overflow-x-auto border border-zinc-850/50 rounded-xl">
          <table className="w-full text-left border-collapse text-xs min-w-max">
            <thead>
              <tr className="border-b border-zinc-850 text-[10px] font-mono text-zinc-400 uppercase bg-zinc-950/50">
                <th className="py-3 px-4 font-black tracking-wide">Staff Role</th>
                <th className="py-3 px-4 font-black tracking-wide">Staff Name</th>
                <th className="py-3 px-4 font-black tracking-wide">Mobile Number</th>
                <th className="py-3 px-4 font-black tracking-wide">Assignment Date</th>
                <th className="py-3 px-4 font-black tracking-wide">Reporting Time</th>
                <th className="py-3 px-4 font-black tracking-wide">Event Date</th>
                <th className="py-3 px-4 font-black tracking-wide text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/40 text-[11px] text-zinc-300 font-mono">
              {consolidatedRoster.length > 0 ? (
                consolidatedRoster.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-950/40 transition-colors">
                    {/* Staff Role */}
                    <td className="py-3 px-4 font-sans font-bold text-zinc-200">
                      <span className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-[10px] rounded text-zinc-400">
                        {item.role}
                      </span>
                    </td>
                    {/* Staff Name */}
                    <td className="py-3 px-4 font-sans font-extrabold text-white text-xs max-w-[150px] break-words-on-mobile break-words">
                      {item.name}
                    </td>
                    {/* Mobile Number */}
                    <td className="py-3 px-4 text-zinc-400">
                      {item.mobile}
                    </td>
                    {/* Assignment Date */}
                    <td className="py-3 px-4 text-zinc-450">
                      {formatDateDDMMYY(item.assignDate)}
                    </td>
                    {/* Reporting Time */}
                    <td className="py-3 px-4 font-bold text-amber-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-550 flex-shrink-0" />
                        <span>{formatTime12Hour(item.reportingTime)}</span>
                      </div>
                    </td>
                    {/* Event Date */}
                    <td className="py-3 px-4 text-indigo-300 font-bold">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zinc-550 flex-shrink-0" />
                        <span>{formatDateDDMMYY(item.eventDate)}</span>
                      </div>
                    </td>
                    {/* Status */}
                    <td className="py-3 px-4 text-right">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border ${
                        item.status === 'Completed'
                          ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500 italic font-sans text-xs">
                    No active staff allocations recorded on the operations dossier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
