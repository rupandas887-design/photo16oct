import React from 'react';
import { OperationsLeads } from './operations/OperationsLeads';
import { EquipmentManagement } from './operations/EquipmentManagement';
import { OperationsStaffManagement } from './operations/OperationsStaffManagement';
import { OperationsStaffReport } from './operations/OperationsStaffRoster';
import { EventScheduling } from './operations/EventScheduling';
import { TeamAssignments } from './operations/TeamAssignments';
import { NotificationsModule } from './NotificationsModule';
import { OperationsAnalytics } from './operations/OperationsAnalytics';
import { OperationsCalendar } from './OperationsCalendar';
import { useRole } from './RoleContext';
import { DashboardGreetingHeader } from './DashboardGreetingHeader';
import { normalizeCategory, parseTeamMembers, formatQtyList } from '../utils';
import { 
  Briefcase, Sparkles, Calendar, BarChart3, Shield, Search, 
  Layers, Camera, Users, Clock, Bell
} from 'lucide-react';

interface OperationsModuleProps {
  activeSubTab?: 'operations_leads' | 'operations_calendar' | 'equipment_management' | 'operations_staff' | 'operations_staff_roster' | 'event_scheduling' | 'team_assignments' | 'operations_notifications' | 'operations_analytics' | 'package_catalogue';
  setActiveSubTab?: (tab: any) => void;
}

const PackageCatalogueView: React.FC = () => {
  const { packages } = useRole();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('All');

  const filtered = (packages || []).filter(p => {
    const matchesSearch = p.package_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.deliverables && p.deliverables.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = catFilter === 'All' || normalizeCategory(p.category) === catFilter;
    return matchesSearch && matchesCat;
  });

  const categories = ['All', ...Array.from(new Set((packages || []).map(p => normalizeCategory(p.category))))];

  return (
    <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-6 space-y-6 text-left relative overflow-hidden font-sans">
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/[0.02] rounded-full blur-3xl pointer-events-none" />
      
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 font-sans tracking-wide">
            Operational Service Catalogue
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Active production & dispatch package layouts synced directly with client pipeline presets.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative w-full sm:w-48">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search deliverables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-zinc-900/80 border border-zinc-800 text-xs px-3 py-1.5 pl-8 text-zinc-100 rounded-xl focus:outline-none focus:border-amber-500/50 w-full"
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="bg-zinc-900/80 border border-zinc-800 text-xs px-3 py-1.5 text-zinc-350 rounded-xl focus:outline-none focus:border-amber-500/50 cursor-pointer"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-zinc-850 rounded-xl">
          <p className="text-xs text-zinc-500 font-mono">No matching package templates found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pkg) => (
            <div key={pkg.package_id} className="bg-[#09090b]/90 border border-zinc-900 hover:border-zinc-800 rounded-xl p-4.5 space-y-4 relative flex flex-col justify-between transition-all duration-350">
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-[9px] px-2 py-0.5 border border-zinc-800 text-zinc-500 uppercase font-mono font-bold rounded">
                      {normalizeCategory(pkg.category)}
                    </span>
                    <h4 className="text-zinc-200 text-sm font-bold mt-1.5 leading-snug">{pkg.package_name}</h4>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs text-zinc-500 font-mono">PKG ID:</span>
                    <span className="text-[10px] text-amber-500 font-bold font-mono pl-1">{pkg.package_id}</span>
                  </div>
                </div>

                <div className="h-px bg-zinc-900" />

                <div className="space-y-2 text-xs">
                  {pkg.duration && (
                    <div className="flex justify-between text-zinc-400">
                      <span className="text-zinc-500 font-mono text-[10px]">DURATION:</span>
                      <span>{pkg.duration}</span>
                    </div>
                  )}
                  {pkg.team_members && (
                    <div className="flex justify-between text-zinc-400 gap-2">
                      <span className="text-zinc-500 font-mono text-[10px] shrink-0">CREW PROFILE:</span>
                      <span className="text-right break-words max-w-[150px]">{formatQtyList(pkg.team_members)}</span>
                    </div>
                  )}
                </div>

                {pkg.deliverables && (
                  <div className="bg-[#040405] border border-zinc-905 p-2.5 rounded-lg text-[11px] text-zinc-405 space-y-1">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold block pb-1">Included Deliverables:</span>
                    <span className="leading-relaxed block">{formatQtyList(pkg.deliverables)}</span>
                  </div>
                )}

                {pkg.seasonal_offer && (
                  <div className="bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg text-[10px] text-amber-400/80 flex items-center gap-1.5 font-mono">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span className="break-words">Special: {pkg.seasonal_offer}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-900 flex items-center justify-between mt-4">
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">STANDARD TARIFF</span>
                <span className="text-sm font-black text-white font-mono flex items-center">
                  <span className="text-amber-500 font-light pr-0.5">₹</span>
                  <span>{pkg.price.toLocaleString('en-IN')}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const OperationsModule: React.FC<OperationsModuleProps> = ({ 
  activeSubTab = 'operations_leads',
  setActiveSubTab
}) => {
  const { currentUser, staff = [] } = useRole();

  const loggedInStaffMember = (staff || []).find((s: any) => 
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
    (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
  );
  const loggedInMobile = currentUser?.mobile || (currentUser as any)?.phone || loggedInStaffMember?.mobile || '';

  return (
    <div id="operations_module" className="space-y-6">
      {/* Operations Dashboard Header / User Info */}
      <div className="border-b border-zinc-900 pb-5">
        <DashboardGreetingHeader
          dashboardTitle="Operations Manager"
          userName={currentUser?.name || loggedInStaffMember?.name}
          userMobile={loggedInMobile}
        />
      </div>

      {/* Render sub-modules based on selection state */}
      <div className="w-full">
        <div className={activeSubTab === 'operations_leads' ? '' : 'hidden'}>
           <OperationsLeads />
        </div>
        {activeSubTab === 'operations_calendar' && <OperationsCalendar />}
        {activeSubTab === 'equipment_management' && <EquipmentManagement />}
        {activeSubTab === 'operations_staff' && <OperationsStaffManagement />}
        {activeSubTab === 'operations_staff_roster' && <OperationsStaffReport />}
        {activeSubTab === 'event_scheduling' && <EventScheduling />}
        {activeSubTab === 'team_assignments' && <TeamAssignments />}
        {activeSubTab === 'operations_notifications' && <NotificationsModule />}
        {activeSubTab === 'operations_analytics' && <OperationsAnalytics />}
        {activeSubTab === 'package_catalogue' && <PackageCatalogueView />}
      </div>
    </div>
  );
};
