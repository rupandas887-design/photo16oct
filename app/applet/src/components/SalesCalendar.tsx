import React, { useState, useMemo } from 'react';
import { UnifiedCalendar } from './UnifiedCalendar';
import { useRole } from './RoleContext';
import { Filter } from 'lucide-react';

interface SalesCalendarProps {
  onSelectLead?: (lead: any) => void;
}

export const SalesCalendar: React.FC<SalesCalendarProps> = ({ onSelectLead }) => {
  const { currentUser, currentUserName, leads = [], allLeads = [], orders = [], allOrders = [], quotations = [] } = useRole();
  const [selectedSalesperson, setSelectedSalesperson] = useState<string>('All Sales Staff');

  const effectiveOrders = (allOrders && allOrders.length > 0) ? allOrders : orders;
  const effectiveLeads = (allLeads && allLeads.length > 0) ? allLeads : leads;

  // Extract all distinct salesperson names across leads, orders, and quotations
  const salesStaffList = useMemo(() => {
    const names = new Set<string>();
    (effectiveLeads || []).forEach(l => {
      if (l.sales_staff_name && String(l.sales_staff_name).trim()) names.add(String(l.sales_staff_name).trim());
      if (l.sales_person && String(l.sales_person).trim()) names.add(String(l.sales_person).trim());
    });
    (effectiveOrders || []).forEach(o => {
      if (o.sales_staff_name && String(o.sales_staff_name).trim()) names.add(String(o.sales_staff_name).trim());
      if (o.sales_person && String(o.sales_person).trim()) names.add(String(o.sales_person).trim());
    });
    (quotations || []).forEach(q => {
      if (q.sales_staff_name && String(q.sales_staff_name).trim()) names.add(String(q.sales_staff_name).trim());
      if (q.sales_person && String(q.sales_person).trim()) names.add(String(q.sales_person).trim());
    });
    if (currentUser?.name) names.add(currentUser.name);
    return Array.from(names).filter(n => n && !['unassigned', 'none', 'n/a', 'null', 'undefined', '—', '-'].includes(n.toLowerCase())).sort();
  }, [effectiveLeads, effectiveOrders, quotations, currentUser]);

  return (
    <div className="space-y-4">
      {/* Calendar Header with Salesperson Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-850 shadow-xl">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="p-1 px-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono rounded tracking-widest">CALENDAR</span>
          <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">Shared Sales Calendar</h3>
        </div>

        {/* Salesperson Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-mono text-zinc-400">Sales Staff:</span>
          <select
            value={selectedSalesperson}
            onChange={(e) => setSelectedSalesperson(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-white text-xs rounded-xl px-3 py-1.5 font-mono focus:outline-none focus:border-blue-500 transition cursor-pointer"
          >
            <option value="All Sales Staff">All Sales Staff</option>
            {salesStaffList.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>
      <UnifiedCalendar role="sales" selectedSalesperson={selectedSalesperson} onSelectLead={onSelectLead} />
    </div>
  );
};
