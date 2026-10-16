import React, { Component, ReactNode, ErrorInfo, useMemo } from 'react';
import { SalesModuleProps } from './SalesUtils';
import { useSalesDashboardState } from './sales/useSalesDashboardState';
import { SalesBookingConfirmationModal } from './sales/SalesBookingConfirmationModal';
import { SalesLeadsTable } from './sales/SalesLeadsTable';
import { SalesCustomerProfiles } from './sales/SalesCustomerProfiles';
import { SalesPackagesManager } from './sales/SalesPackagesManager';
import { SalesCrmWizard } from './sales/SalesCrmWizard';
import { SalesModals } from './sales/SalesModals';
import { SalesCalendar } from './SalesCalendar';
import { CustomPackageMaster } from './CustomPackageMaster';
import { AnimatedSalesGreeting } from './sales/AnimatedSalesGreeting';
import { DashboardGreetingHeader } from './DashboardGreetingHeader';
import { useRole } from './RoleContext';
import { Plus, AlertTriangle, RefreshCw, FileText, Calendar, Users, Layers, Sparkles } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SalesErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };
  public props!: ErrorBoundaryProps;
  public setState!: (state: Partial<ErrorBoundaryState> | ((prevState: ErrorBoundaryState) => Partial<ErrorBoundaryState>)) => void;

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SalesDashboard Error Boundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center space-y-4 max-w-lg mx-auto my-12 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto text-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white font-sans">Sales View Notice</h3>
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              An unexpected render issue occurred in this section. Click below to reload the sales view safely.
            </p>
            {this.state.error?.message && (
              <p className="text-[11px] text-red-300 font-mono bg-slate-950/60 p-2 rounded border border-slate-800 break-words">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Sales Desk</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SalesDashboardModule: React.FC<SalesModuleProps> = ({ 
  activeSubTab: externalActiveTab, 
  setActiveSubTab: externalSetActiveTab 
}) => {
  const state = useSalesDashboardState(externalActiveTab, externalSetActiveTab);
  const { currentUser, currentUserName, staff = [], users = [] } = useRole();

  // Logged-in Sales Person name computation
  const salesPersonName = useMemo(() => {
    if (currentUser?.name) return currentUser.name;
    if ((currentUser as any)?.full_name) return (currentUser as any).full_name;
    if (currentUserName && currentUserName !== 'Sales Team') return currentUserName;

    // Look up in users list
    const userMatch = (users || []).find((u: any) =>
      (currentUser?.id && (u.id === currentUser.id || (u as any).auth_user_id === currentUser.id)) ||
      (currentUser?.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser?.mobile && u.mobile && u.mobile === currentUser.mobile)
    );
    if (userMatch?.name) return userMatch.name;
    if (userMatch?.full_name) return userMatch.full_name;

    // Look up in staff
    const staffMatch = (staff || []).find((s: any) =>
      (currentUser?.id && s.staff_id === currentUser.id) ||
      (currentUser?.email && s.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser?.mobile && s.mobile && s.mobile === currentUser.mobile)
    );
    if (staffMatch?.name) return staffMatch.name;

    return currentUser?.name || currentUserName || 'Sales Team';
  }, [currentUser, currentUserName, users, staff]);

  // Logged-in Sales Person mobile computation
  const loggedInSalesMobile = useMemo(() => {
    if (currentUser?.mobile) return currentUser.mobile;
    if ((currentUser as any)?.phone) return (currentUser as any).phone;

    // Look up in staff
    const staffMatch = (staff || []).find((s: any) =>
      (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) ||
      (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
    if (staffMatch?.mobile) return staffMatch.mobile;

    // Look up in users list
    const userMatch = (users || []).find((u: any) =>
      (u.mobile && currentUser?.mobile && u.mobile === currentUser.mobile) ||
      (u.email && currentUser?.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (u.name && currentUser?.name && u.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
    if (userMatch?.mobile) return userMatch.mobile;
    if ((userMatch as any)?.phone) return (userMatch as any).phone;

    // Match by resolved sales person name
    if (salesPersonName && salesPersonName !== 'Sales Team') {
      const matchByName = (users || []).find((u: any) => 
        (u.name && u.name.trim().toLowerCase() === salesPersonName.trim().toLowerCase()) ||
        (u.full_name && u.full_name.trim().toLowerCase() === salesPersonName.trim().toLowerCase())
      );
      if (matchByName?.mobile) return matchByName.mobile;
      if ((matchByName as any)?.phone) return (matchByName as any).phone;

      const staffByName = (staff || []).find((s: any) => 
        s.name && s.name.trim().toLowerCase() === salesPersonName.trim().toLowerCase()
      );
      if (staffByName?.mobile) return staffByName.mobile;
    }

    return '';
  }, [currentUser, staff, users, salesPersonName]);

  return (
    <SalesErrorBoundary>
      <div id="sales_module" className="space-y-6">
        {/* Schema / Integrity Exception Modal */}
        {state.statusError && (
          <div className="fixed inset-0 bg-slate-955/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-center gap-3">
                <span className="p-2.5 bg-red-500/20 text-red-400 rounded-xl text-lg">⚠️</span>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm font-sans">{state.statusError.title || 'Status Update Failed'}</h3>
                  <p className="text-[10px] text-red-400 font-mono tracking-wider">DATABASE SCHEMA / INTEGRITY EXCEPTION</p>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Reason:</span>
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs text-red-300 font-mono leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {state.statusError.reason}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">Suggested Fix / Schema Migration:</span>
                  <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-xl p-3 text-xs text-emerald-300 font-sans leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {state.statusError.suggestedFix}
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/40 border-t border-slate-800 px-6 py-3.5 flex justify-end">
                <button
                  onClick={() => state.setStatusError(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
                >
                  Dismiss Details
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header Bar */}
        {state.activeTab !== 'create' && state.activeTab !== 'custom_package_master' && !state.selectedLead && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <DashboardGreetingHeader
              dashboardTitle="Sales Dashboard"
              userName={salesPersonName}
              userMobile={loggedInSalesMobile}
            />

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Sub-tab pills - Keep ONLY Sales Calendar */}
              <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800 flex-wrap">
                <button
                  id="btn_lead_tab_calendar"
                  type="button"
                  onClick={() => { 
                    state.setActiveTab(state.activeTab === 'calendar' ? 'list' : 'calendar'); 
                    state.setSelectedLead(null); 
                    if (state.setSelectedCustomerProfileId) state.setSelectedCustomerProfileId(null); 
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    state.activeTab === 'calendar'
                      ? 'bg-zinc-800 border-zinc-700 text-white shadow-sm font-black'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span>{state.activeTab === 'calendar' ? '📋 Leads Directory' : 'Sales Calendar'}</span>
                </button>
              </div>

              {/* Create Quotation Button */}
              {state.canEdit && (
                <button
                  id="btn_create_new_lead"
                  type="button"
                  onClick={() => {
                    if (typeof state.setActiveTab === 'function') {
                      state.setActiveTab('create');
                    }
                    if (typeof state.setSelectedLead === 'function') {
                      state.setSelectedLead(null);
                    }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Create Quotation</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* View Sub-Tabs Switcher */}
        {state.activeTab === 'custom_package_master' && (
          <CustomPackageMaster />
        )}

        {state.activeTab === 'calendar' && !state.selectedLead && (
          <SalesCalendar onSelectLead={(lead) => state.handleSelectLead(lead)} />
        )}

        {state.activeTab === 'profiles' && !state.selectedLead && (
          <SalesCustomerProfiles {...state} />
        )}

        {state.activeTab === 'packages' && !state.selectedLead && (
          <SalesPackagesManager {...state} />
        )}

        {/* Screen 2 Create Lead / Step 1, 2, 3 CRM Wizard */}
        {(state.activeTab === 'create' || state.selectedLead) && (
          <SalesCrmWizard {...state} />
        )}

        {/* Leads Directory & Table (when not in create/lead detail/special view) */}
        {(state.activeTab === 'list' || !['custom_package_master', 'calendar', 'profiles', 'packages', 'create'].includes(state.activeTab)) && !state.selectedLead && (
          <SalesLeadsTable {...state} />
        )}

        {/* Booking Confirmation & Contract Form Modal */}
        <SalesBookingConfirmationModal {...state} />

        {/* Supporting Global & Action Modals */}
        <SalesModals {...state} />
      </div>
    </SalesErrorBoundary>
  );
};

export const SalesModule = SalesDashboardModule;
