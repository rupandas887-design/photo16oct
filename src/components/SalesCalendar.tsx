import React, { useState, useMemo } from 'react';
import { Filter } from 'lucide-react';
import { UnifiedCalendar } from './UnifiedCalendar';
import { useRole } from './RoleContext';

interface SalesCalendarProps {
  onSelectLead?: (lead: any) => void;
}

export const SalesCalendar: React.FC<SalesCalendarProps> = ({ onSelectLead }) => {
  const { 
    currentUserName, 
    leads = [], 
    allLeads, 
    orders = [], 
    allOrders, 
    users = [], 
    staff = [] 
  } = useRole();
  
  const [selectedSalesperson, setSelectedSalesperson] = useState('All Sales Staff');

  const sourceLeads = (allLeads && allLeads.length > 0) ? allLeads : leads;
  const sourceOrders = (allOrders && allOrders.length > 0) ? allOrders : orders;

  // Derive unique salespersons across all leads, orders, users, and staff
  const salespersons = useMemo(() => {
    const names = new Set<string>();
    sourceLeads.forEach(l => {
      if (l.sales_person) names.add(l.sales_person);
      if (l.sales_staff_name) names.add(l.sales_staff_name);
      if (l.created_by) names.add(l.created_by);
    });
    sourceOrders.forEach(o => {
      if (o.sales_person) names.add(o.sales_person);
      if (o.sales_staff_name) names.add(o.sales_staff_name);
      if (o.created_by) names.add(o.created_by);
    });
    (users || []).forEach(u => {
      if (u.role === 'Sales Team' && u.name) names.add(u.name);
    });
    (staff || []).forEach(s => {
      if ((s.role === 'Sales' || s.department === 'Sales' || s.role === 'Sales Team') && s.name) names.add(s.name);
    });
    return Array.from(names)
      .filter(n => n && typeof n === 'string' && !['unassigned', 'none', 'n/a', 'null', 'undefined', '—', '-', 'system', 'admin'].includes(n.trim().toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  }, [sourceLeads, sourceOrders, users, staff]);

  return (
    <div className="space-y-4">
      {/* Calendar Header with Shared Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-850 shadow-xl">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="p-1 px-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono rounded tracking-widest">CALENDAR</span>
          <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">Sales Calendar</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500" />
          <select 
            className="bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono py-1.5 px-3 rounded-lg focus:ring-1 focus:ring-blue-500 cursor-pointer"
            value={selectedSalesperson}
            onChange={(e) => setSelectedSalesperson(e.target.value)}
          >
            <option value="All Sales Staff">All Sales Staff</option>
            {salespersons.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </div>
      <UnifiedCalendar role="sales" selectedSalesperson={selectedSalesperson} onSelectLead={onSelectLead} />
    </div>
  );
};
