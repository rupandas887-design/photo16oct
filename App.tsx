import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabaseClient } from './supabaseClient';
import { RoleProvider, useRole } from './components/RoleContext';
import { RoleSwitcher } from './components/RoleSwitcher';
import { Dashboard } from './components/Dashboard';
import { SalesAnalytics } from './components/analytics/SalesAnalytics';
import { OperationsAnalytics } from './components/analytics/OperationsAnalytics';
import { ProductionAnalytics } from './components/analytics/ProductionAnalytics';
import { BusinessOverviewAnalytics } from './components/analytics/BusinessOverviewAnalytics';
import { SalesDashboardModule } from './components/SalesDashboardModule';
import { OperationsModule } from './components/OperationsModule';
import { StaffModule } from './components/StaffModule';
import { ProductionStaffModule } from './components/ProductionStaffModule';
import { OperationsStaffReport } from './components/OperationsStaffReport';
import { ProductionStaffReport } from './components/ProductionStaffReport';
import { ProductionModule } from './components/ProductionModule';
import { ProductionExtensionContainer } from './components/ProductionDashboardUpdates';
import { StaffManagementModule } from './components/StaffManagementModule';
import { PaymentsModule } from './components/PaymentsModule';
import { PendingPaymentsReport } from './components/analytics/PendingPaymentsReport';
import { OrderSearch } from './components/OrderSearch';
import { LoginScreen } from './components/LoginScreen';
import { StudioLoader } from './components/StudioLoader';
import { UserManagementModule } from './components/UserManagementModule';
import { SalesStaffManagementModule } from './components/SalesStaffManagementModule';
import { DatabaseHealthModule } from './components/DatabaseHealthModule';
import { NotificationsModule } from './components/NotificationsModule';
import { BusinessOwnerDashboard } from './components/BusinessOwnerDashboard';
import { 
  OwnerRevenueAnalytics, 
  OwnerEventCalendar, 
  OwnerSalesReport, 
  OwnerStaffPerformanceReport
} from './components/OwnerModule';
import { AppLogo } from './components/AppLogo';
import { initGlobalModalViewportHandler, initGlobalErrorViewportHandler, getAllMatchingOrderIds, calculateStaffActiveBookingsCount } from './utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, Camera, Video, Landmark, Shield, Users, User, Search, Info, Target, Sparkles, Menu, RefreshCw, Activity, Bell,
  UserPlus, Truck, Layers, CheckSquare, Clock, Play, BarChart3, LogOut, Calendar, TrendingUp, DollarSign, FileText, Package,
  LayoutDashboard, ShieldCheck, ClipboardList
} from 'lucide-react';

const AccessDeniedView: React.FC<{ section: string }> = ({ section }) => {
  return (
    <div className="bg-red-950/15 border border-red-900/40 rounded-2xl p-8 py-12 text-center max-w-xl mx-auto my-12 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-red-500/[0.03] blur-2xl pointer-events-none" />
      <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center rounded-3xl mx-auto mb-6 shadow-inner ring-4 ring-red-500/5">
        <Shield className="w-8 h-8 font-bold" />
      </div>
      <h3 className="text-lg font-black uppercase tracking-wider text-rose-450 font-sans">
        Access Denied / Security Shield
      </h3>
      <p className="text-xs text-red-450 font-mono mt-2 tracking-wide uppercase">
        Division bounds violations detected
      </p>
      <div className="h-px bg-zinc-850 my-5" />
      <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
        Your designated access credential level does not possess active read or execute clearance parameters for the requested section: <strong className="text-zinc-200">{section}</strong>.
      </p>
    </div>
  );
};

const MainAppContent: React.FC = () => {
  const { 
    currentUser, 
    currentRole, 
    staff = [],
    staffAssignments = [],
    leads = [],
    operations = [],
    resetAllData, 
    refreshData, 
    notifications, 
    logout,
    globalDateRange,
    setGlobalDateRange,
    resetGlobalDateRange,
    isDataLoading,
    orders,
    production,
    payments,
    paymentHistory
  } = useRole();
  const [appLoaded, setAppLoaded] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [unlockRequests, setUnlockRequests] = useState<any[]>([]);

  // Automatically ensure every opened modal/popup across all dashboards scrolls into viewport and resets internal scroll to top,
  // and automatically brings any error messages or invalid fields into view across all sections
  useEffect(() => {
    const cleanupModal = initGlobalModalViewportHandler();
    const cleanupError = initGlobalErrorViewportHandler();
    return () => {
      cleanupModal();
      cleanupError();
    };
  }, []);

  useEffect(() => {
    if (currentRole !== 'Business Owner' || !supabaseClient) return;

    let isMounted = true;
    const fetchPending = async () => {
      const { data: unlocks } = await supabaseClient.from('unlock_requests').select('*');
      if (isMounted && unlocks) {
        setUnlockRequests(unlocks);
      }
    };
    fetchPending();

    const channel = supabaseClient
      .channel('app_rt_unlock_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unlock_requests' }, () => {
        fetchPending();
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabaseClient.removeChannel(channel);
    };
  }, [currentRole]);

  const pendingApprovalCount = useMemo(() => {
    if (currentRole !== 'Business Owner' || !orders) return 0;

    const validApprovalStages = [
      'client acceptance',
      'client accepted',
      'customer acceptance',
      'business owner review',
      'final approval',
      'accepted',
      'approved'
    ];
    const isApprovalStage = (st?: string) => {
      if (!st) return false;
      const lower = st.trim().toLowerCase();
      return validApprovalStages.some(s => lower === s || lower.includes('client acceptance'));
    };
    const isClosedStage = (st?: string) => {
      if (!st) return false;
      const lower = st.trim().toLowerCase();
      return lower === 'order closed' || lower === 'closed' || lower === 'project closed' || lower === 'completed' || lower === 'project completed';
    };

    const candidatesMap = new Map<string, any>();

    const addCandidate = (baseOrder: any, relatedProd?: any) => {
      const key = baseOrder.order_id || baseOrder.lead_id;
      if (!key) return;

      const currentStage = baseOrder.current_stage || relatedProd?.editing_status || relatedProd?.production_status || 'Client Acceptance';
      if (isClosedStage(currentStage) || isClosedStage(relatedProd?.editing_status) || isClosedStage(baseOrder.order_status)) {
        return;
      }

      const orderMatch = isApprovalStage(baseOrder.current_stage) || isApprovalStage(baseOrder.order_status);
      const prodMatch = relatedProd && (
        isApprovalStage(relatedProd.editing_status) ||
        isApprovalStage(relatedProd.production_status) ||
        isApprovalStage(relatedProd.customer_review_status)
      );

      if (orderMatch || prodMatch) {
        if (!candidatesMap.has(key)) {
          candidatesMap.set(key, baseOrder);
        }
      }
    };

    orders.forEach(o => {
      const relatedProd = production?.find((p: any) => p.tracking_id === o.lead_id || p.order_id === o.lead_id || p.tracking_id === o.order_id);
      addCandidate(o, relatedProd);
    });
    production?.forEach((p: any) => {
      const relatedOrder = orders.find(o => o.lead_id === p.tracking_id || o.order_id === p.tracking_id || o.lead_id === p.order_id);
      if (relatedOrder) {
        addCandidate(relatedOrder, p);
      }
    });

    const pendingUnlocks = unlockRequests.filter(u => u.request_status === 'Pending' || u.status === 'Pending');
    return pendingUnlocks.length + candidatesMap.size;
  }, [currentRole, orders, production, unlockRequests]);

  const pendingPaymentApprovalCount = useMemo(() => {
    if (currentRole !== 'Business Owner' && currentRole !== 'Super Admin' && !String(currentRole || '').toLowerCase().includes('owner')) {
      return 0;
    }

    let rejectedIds = new Set<string>();
    try {
      const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
      if (rejectedSaved) rejectedIds = new Set(JSON.parse(rejectedSaved));
    } catch (_) {}

    const pendingOrderIds = new Set<string>();

    (paymentHistory || []).forEach(h => {
      const histId = String(h.id || h.payment_history_id || '');
      if (rejectedIds.has(histId)) return;
      const isExplicitlyRejected = h.approval_status === 'Rejected' || 
        (typeof h.notes === 'string' && (
          h.notes.includes('Rejected') || 
          h.notes.includes('[REJECTED]') || 
          h.notes.endsWith('- Rejected') || 
          h.notes.toLowerCase().includes('rejected by business owner')
        ));
      if (isExplicitlyRejected) return;

      const isPending = h.approval_status === 'Waiting for Approval' ||
        (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval'));

      if (isPending && h.order_id) {
        const canonical = String(h.order_id).trim();
        const matched = orders.find(o => getAllMatchingOrderIds(o.order_id, o.lead_id, orders).includes(canonical));
        pendingOrderIds.add(matched ? matched.order_id : canonical);
      }
    });

    (payments || []).forEach(p => {
      if (p.payment_status === 'Waiting for Approval' && p.order_id) {
        const canonical = String(p.order_id).trim();
        const matched = orders.find(o => getAllMatchingOrderIds(o.order_id, o.lead_id, orders).includes(canonical));
        pendingOrderIds.add(matched ? matched.order_id : canonical);
      }
    });

    return pendingOrderIds.size;
  }, [currentRole, orders, paymentHistory, payments]);

  const [showInitialLoader, setShowInitialLoader] = useState(() => {
    return localStorage.getItem('erp_current_user') !== null;
  });
  const hasShownLoaderRef = useRef(localStorage.getItem('erp_current_user') !== null);
  const [prevUser, setPrevUser] = useState(currentUser);

  if (currentUser !== prevUser) {
    setPrevUser(currentUser);
    if (currentUser) {
      if (!hasShownLoaderRef.current) {
        setShowInitialLoader(true);
        hasShownLoaderRef.current = true;
      }
    } else {
      setShowInitialLoader(false);
      hasShownLoaderRef.current = false;
    }
  }

  const isTabAllowed = (tab: string): boolean => {
    if (currentRole === 'Business Owner') {
      return [
        'owner_overview',
        'owner_calendar',
        'owner_approval',
        'owner_summary',
        'owner_leads_report',
        'owner_revenue',
        'owner_sales_report',
        'owner_staff_performance',
        'password_reset',
        'dashboard',
        'sales',
        'operations',
        'production',
        'staff_management',
        'sales_staff_management',
        'users',
        'diagnostics',
        'notifications',
        'search',
        'payments'
      ].includes(tab);
    }

    if (currentRole === 'Sales Team') {
      // Sales users can access Leads Directory, Sales Analytics, and Pending Payment Report
      return ['sales', 'sales_analytics', 'pending_payments', 'notifications'].includes(tab);
    }

    if (currentRole === 'Operations Team') {
      // Operations users can only access Operations (which hosts its leads, calendar, staff, and analytics)
      return ['operations', 'notifications'].includes(tab);
    }

    if (currentRole === 'Production Team') {
      // Production users can only access Production (leads, roster, performance, and analytics)
      return ['production', 'staff_management',
        'sales_staff_management', 'notifications'].includes(tab);
    }

    if (currentRole === 'Operation Staff' || currentRole === 'Production Staff' || (currentRole as string) === 'Operations Staff') {
      return ['staff_dashboard', 'staff_report', 'notifications'].includes(tab);
    }

    return false;
  };

  // Handled appLoaded state above

  // Handle date inputs
  const [startInput, setStartInput] = useState(globalDateRange.start);
  const [endInput, setEndInput] = useState(globalDateRange.end);

  useEffect(() => {
    setStartInput(globalDateRange.start);
    setEndInput(globalDateRange.end);
  }, [globalDateRange]);

  const unreadNotificationsCount = notifications.filter(n => !n.is_archived && !n.read_status && (currentRole === 'Business Owner' || n.recipient_role === currentRole || n.recipient_role === 'All')).length;

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshData();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };
  
  // Collapse sidebar/hidden by default, read from sessionStorage to persist during session
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('erp_sidebar_state');
    return saved === 'true'; // Default is false (collapsed/hidden by default)
  });

  useEffect(() => {
    sessionStorage.setItem('erp_sidebar_state', sidebarOpen ? 'true' : 'false');
  }, [sidebarOpen]);

  // Sub-tab selection state for sales suite
  const [activeSalesSubTab, setActiveSalesSubTab] = useState<'list' | 'profiles' | 'packages' | 'calendar' | 'create' | 'custom_package_master'>('list');

  // Sub-tab selection state for production suite
  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'production_leads' | 'production_calendar' | 'project_queue' | 'assignments' | 'tracker' | 'delivery' | 'resources' | 'analytics' | 'staff_performance' | 'overall_performance' | 'deliveries_desk' | 'staff_management'
    | 'sales_staff_management' | 'notifications' | 'crew_roster' | 'staff_roster' | 'production_staff_directory' | 'production_role_specialities'>('production_leads');

  // Sub-tab selection state for operations suite
  const [activeOpSubTab, setActiveOpSubTab] = useState<
    | 'operations_leads'
    | 'operations_calendar'
    | 'equipment_management'
    | 'operations_staff'
    | 'operations_staff_roster'
    | 'event_scheduling'
    | 'team_assignments'
    | 'operations_notifications'
    | 'operations_analytics'
    | 'package_catalogue'
  >('operations_leads');

  // Initialize correct default tab according to user role to avoid visual flashes
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'staff_dashboard'
    | 'staff_report'
    | 'sales'
    | 'operations'
    | 'production'
    | 'staff_management'
    | 'sales_staff_management'
    | 'notifications'
    | 'payments'
    | 'search'
    | 'users'
    | 'diagnostics'
    | 'sales_analytics'
    | 'operations_analytics'
    | 'production_analytics'
    | 'business_overview_analytics'
    | 'pending_payments'
    | 'owner_overview'
    | 'owner_approval'
    | 'owner_summary'
    | 'owner_team_performance'
    | 'owner_revenue'
    | 'owner_calendar'
    | 'owner_sales_report'
    | 'owner_operations_report'
    | 'owner_production_report'
    | 'password_reset'
    | 'notifications'
  >(() => {
    const savedUser = localStorage.getItem('erp_current_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      if (user.role === 'Sales Team') return 'sales';
      if (user.role === 'Operations Team') return 'operations';
      if (user.role === 'Production Team') return 'production';
      if (user.role === 'Operation Staff' || user.role === 'Production Staff') return 'staff_dashboard';
    }
    return 'owner_overview';
  });

  // Responsive tab toggles that collapse sidebar automatically on Tablet / Mobile sizes
  const handleTabSelect = (tab: any) => {
    setActiveTab(tab);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    // Refresh data immediately when dashboard opens/changes
    refreshData();
  };

  const handleSubTabSelect = (subTab: any) => {
    setActiveSubTab(subTab);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    // Refresh data immediately when dashboard opens/changes
    refreshData();
  };

  // Automatically dispatch close-all-popups event when any tab or sub-tab changes
  useEffect(() => {
    window.dispatchEvent(new Event('close-all-popups'));
  }, [activeTab, activeSubTab, activeOpSubTab, activeSalesSubTab]);

  // Listen to ERP Notification Click Events for Direct, Deep Navigation
  useEffect(() => {
    const handleNotifClick = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail) return;
      
      const { recipient_role, notification_type } = customEvent.detail;
      const targetRole = recipient_role || currentRole;

      if (targetRole === 'Sales Team') {
        setActiveTab('sales');
        setActiveSalesSubTab('list');
      } else if (targetRole === 'Operations Team') {
        setActiveTab('operations');
        setActiveOpSubTab('operations_leads');
      } else if (targetRole === 'Production Team') {
        setActiveTab('production');
        setActiveSubTab('production_leads');
      } else if (targetRole === 'Business Owner') {
        // Owner can view the relevant module based on notification type
        if (notification_type?.includes('Lead') || notification_type?.includes('Quotation')) {
          setActiveTab('sales');
          setActiveSalesSubTab('list');
        } else if (notification_type?.includes('Event Scheduled') || notification_type?.includes('Event Completed')) {
          setActiveTab('operations');
          setActiveOpSubTab('operations_leads');
        } else if (notification_type?.includes('Delivered') || notification_type?.includes('Editing') || notification_type?.includes('Raw Footage')) {
          setActiveTab('production');
          setActiveSubTab('production_leads');
        } else {
          setActiveTab('owner_overview');
        }
      }
    };

    window.addEventListener('erp-notification-click', handleNotifClick);
    return () => {
      window.removeEventListener('erp-notification-click', handleNotifClick);
    };
  }, [currentRole]);

  const prevRoleRef = useRef<string>(currentRole);
  const prevUserRef = useRef<any>(null);

  // Guard direct unauthorized access by syncing active tabs with user roles
  useEffect(() => {
    if (currentUser) {
      // 1. Detect fresh login/session recovery and direct to appropriate landing tab
      if (!prevUserRef.current) {
        if (currentRole === 'Business Owner') {
          setActiveTab('owner_overview');
        } else if (currentRole === 'Sales Team') {
          setActiveTab('sales');
        } else if (currentRole === 'Operations Team') {
          setActiveTab('operations');
        } else if (currentRole === 'Production Team') {
          setActiveTab('production');
        } else if (currentRole === 'Operation Staff' || currentRole === 'Production Staff' || (currentRole as string) === 'Operations Staff') {
          setActiveTab('staff_dashboard');
        }
      }
      prevUserRef.current = currentUser;

      // 2. Detect on-the-fly role changes (e.g. from RoleSwitcher/Admin switch)
      if (prevRoleRef.current !== currentRole) {
        prevRoleRef.current = currentRole;
        if (currentRole === 'Business Owner') {
          setActiveTab('owner_overview');
          return;
        }
      }

      // 3. Ensure role boundaries are strictly preserved
      if (currentRole === 'Sales Team') {
        if (!['sales', 'sales_analytics', 'pending_payments', 'notifications'].includes(activeTab)) {
          setActiveTab('sales');
        }
      } else if (currentRole === 'Operations Team') {
        if (!['operations', 'notifications'].includes(activeTab)) {
          setActiveTab('operations');
        }
        if (!['operations_leads', 'operations_calendar', 'operations_staff', 'operations_staff_roster', 'operations_analytics', 'team_assignments', 'package_catalogue', 'equipment_management', 'event_scheduling', 'operations_notifications'].includes(activeOpSubTab)) {
          setActiveOpSubTab('operations_leads');
        }
      } else if (currentRole === 'Production Team') {
        if (!['production', 'notifications', 'staff_management'].includes(activeTab)) {
          setActiveTab('production');
        }
        if (!['production_leads', 'production_calendar', 'crew_roster', 'staff_roster'].includes(activeSubTab)) {
          setActiveSubTab('production_leads');
        }
      } else if (currentRole === 'Operation Staff' || currentRole === 'Production Staff' || (currentRole as string) === 'Operations Staff') {
        if (!['staff_dashboard', 'staff_report', 'notifications'].includes(activeTab)) {
          setActiveTab('staff_dashboard');
        }
      }
    } else {
      prevUserRef.current = null;
    }
  }, [currentUser, currentRole, activeTab, activeOpSubTab, activeSubTab]);

  // If session is unauthenticated, render the Login screen
  if (!currentUser) {
    return <LoginScreen />;
  }

  // App is loaded

  // Determine if active tab is write-protected for the current user
  const getWriteStatus = () => {
    if (currentRole === 'Business Owner') {
      return { label: 'STUDIO PRO ADMINISTRATIVE LEVEL // FULL READ-WRITE CLEARANCE', type: 'ok', readonly: false };
    }
    return { label: `ISOLATED DIVISION DESK ACTIVE // WRITING SIGNED FOR ${currentRole.toUpperCase()}`, type: 'ok', readonly: false };
  };

  const writeStatus = getWriteStatus();

  // Helper to render sidebar items to avoid visual design duplication
  const renderSidebarContent = () => {
    const loggedInStaffMember = (staff || []).find((s: any) => 
      (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
      (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
    );
    const staffDisplayName = loggedInStaffMember?.name || currentUser?.name || currentUser?.email || 'Staff';
    const staffDisplayMobile = loggedInStaffMember?.mobile || currentUser?.mobile || '';
    const assignedTasksCount = calculateStaffActiveBookingsCount(
      staffDisplayName,
      staffAssignments,
      leads,
      orders,
      operations
    );

    return (
    <aside className="w-full space-y-4">
      {/* Sidebar Brand Logo Header */}
      <div className="p-3 flex flex-col items-center justify-center relative border-b border-zinc-900/40 pb-5">
        <AppLogo size="md" showTextOnFallback={false} />
        {/* Interactive Close button for Mobile/Tablet */}
        <button
          id="btn_sidebar_close"
          onClick={() => setSidebarOpen(false)}
          className="absolute -top-1 -right-1 lg:hidden p-2 text-zinc-400 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-850 rounded-xl cursor-pointer flex items-center justify-center transition-all shadow-md h-8 w-8 select-none"
          title="Close Navigation"
        >
          ✕
        </button>
      </div>

      {(currentRole === 'Operation Staff' || currentRole === 'Production Staff' || (currentRole as string) === 'Operations Staff') ? (
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-850 p-4 space-y-3.5 shadow-xl relative animate-in fade-in duration-300">
          {currentRole !== 'Production Staff' && (
            <div className="flex items-center justify-between pb-1 border-b border-zinc-850">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400 font-mono flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-amber-500" />
                <span>OPERATIONS STAFF</span>
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
          )}

          <nav className="space-y-1.5">
            <button
              onClick={() => {
                handleTabSelect('staff_dashboard');
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 text-left border cursor-pointer ${
                activeTab === 'staff_dashboard'
                  ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-zinc-700 font-bold shadow-md'
                  : 'text-zinc-400 bg-transparent border-transparent hover:bg-zinc-900/50 hover:text-white hover:border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className={`w-4 h-4 flex-shrink-0 ${currentRole === 'Production Staff' ? 'text-purple-400' : 'text-amber-500'}`} />
                <span className="tracking-wide">
                  {currentRole === 'Production Staff' ? 'My Deliverables' : 'My Bookings'}
                </span>
              </div>
              <ChevronRightIcon active={activeTab === 'staff_dashboard'} />
            </button>

            <button
              onClick={() => {
                handleTabSelect('staff_report');
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 text-left border cursor-pointer ${
                activeTab === 'staff_report'
                  ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-zinc-700 font-bold shadow-md'
                  : 'text-zinc-400 bg-transparent border-transparent hover:bg-zinc-900/50 hover:text-white hover:border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileText className={`w-4 h-4 flex-shrink-0 ${currentRole === 'Production Staff' ? 'text-purple-400' : 'text-amber-500'}`} />
                <span className="tracking-wide">Report</span>
              </div>
              <ChevronRightIcon active={activeTab === 'staff_report'} />
            </button>
          </nav>
        </div>
      ) : activeTab === 'operations' || currentRole === 'Operations Team' ? (
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-850 p-4 space-y-4 shadow-xl relative animate-in fade-in duration-300">
          {/* Corner calibration tick marks */}
          <div className="absolute top-2 left-2 w-1 h-1 bg-amber-500/50" />
          <div className="absolute top-2 right-2 w-1 h-1 bg-amber-500/50" />
          <div className="absolute bottom-2 left-2 w-1 h-1 bg-amber-500/50" />
          <div className="absolute bottom-2 right-2 w-1 h-1 bg-amber-500/50" />

          <div className="flex items-center justify-between pb-1 border-b border-zinc-850">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400 font-mono flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-amber-500" />
              <span>OPERATIONS DESK</span>
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          </div>

          {/* Return button for Business Owner */}
          {currentRole === 'Business Owner' && (
            <button
              onClick={() => {
                handleTabSelect('dashboard');
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[10px] font-mono uppercase tracking-wider font-extrabold rounded-xl transition-all duration-200 border cursor-pointer border-zinc-800 text-zinc-400 hover:bg-zinc-900/50 hover:text-white"
            >
              <span>←</span>
              <span>Back to Studio Desks</span>
            </button>
          )}

          <nav className="space-y-1.5">
            {[
              { id: 'operations_leads', label: 'Operations Leads', icon: Briefcase },
              { id: 'operations_calendar', label: 'Operations Calendar', icon: Calendar },
              { id: 'operations_staff', label: 'Staff Directory', icon: Users },
              { id: 'operations_staff_roster', label: 'Staff Roster', icon: ClipboardList },
              { id: 'equipment_management', label: 'Equipment Inventory', icon: Package }
            ].map((tab) => {
              const IconComponent = tab.icon;
              const isSelected = activeOpSubTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    handleTabSelect('operations');
                    setActiveOpSubTab(tab.id as any);
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl transition-all cursor-pointer border text-left ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-400 border-amber-500/30 font-bold'
                      : 'text-zinc-400 bg-transparent border-transparent hover:bg-zinc-900/50 hover:text-white hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComponent className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <span className="tracking-wide">
                      {tab.label}
                      {tab.id === 'operations_notifications' && unreadNotificationsCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-[9px] text-rose-400 font-bold border border-rose-500/30">
                          {unreadNotificationsCount}
                        </span>
                      )}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-amber-500">●</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      ) : activeTab === 'production' || currentRole === 'Production Team' ? (
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-850 p-4 space-y-4 shadow-xl relative">
          {/* Corner calibration tick marks */}
          <div className="absolute top-2 left-2 w-1 h-1 bg-purple-500/50" />
          <div className="absolute top-2 right-2 w-1 h-1 bg-purple-500/50" />
          <div className="absolute bottom-2 left-2 w-1 h-1 bg-purple-500/50" />
          <div className="absolute bottom-2 right-2 w-1 h-1 bg-purple-500/50" />

          <div className="flex items-center justify-between pb-1 border-b border-zinc-850">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400 font-mono flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-purple-400" />
              <span>PRODUCTION DESK</span>
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
          </div>

          {/* Return button for Business Owner */}
          {currentRole === 'Business Owner' && (
            <button
              onClick={() => {
                handleTabSelect('dashboard');
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[10px] font-mono uppercase tracking-wider font-extrabold rounded-xl transition-all duration-200 border cursor-pointer border-zinc-800 text-zinc-450 hover:bg-zinc-900/50 hover:text-white"
            >
              <span>←</span>
              <span>Back to Studio Desks</span>
            </button>
          )}

          <nav className="space-y-1.5">
            {[
              { id: 'production_staff_directory', label: 'Production Staff Directory', icon: Users },
              { id: 'production_role_specialities', label: 'Production Role Specialities', icon: Target },
              { id: 'production_leads', label: 'Production Leads', icon: Sparkles },
              { id: 'production_calendar', label: 'Production Calendar', icon: Calendar },
              { id: 'staff_management', label: 'Staff Management', icon: UserPlus },
              { id: 'crew_roster', label: 'Crew Roster', icon: Users },
              { id: 'staff_roster', label: 'Staff Roster', icon: Users },
              { id: 'staff_performance', label: 'Staff Performance', icon: Users },
              { id: 'overall_performance', label: 'Overall Performance', icon: BarChart3 },
              { id: 'deliveries_desk', label: 'Deliveries Desk', icon: Truck },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'pipeline', label: 'Workflow Board', icon: Layers },
              { id: 'project_queue', label: 'Active Queue', icon: CheckSquare },
              { id: 'assignments', label: 'Staff Assignments', icon: Users },
              { id: 'tracker', label: 'Kanban Tracker', icon: Clock },
              { id: 'resources', label: 'Resources Audit', icon: Play },
              { id: 'analytics', label: 'Studio Analytics', icon: BarChart3 }
            ].filter(tab => {
              if (tab.id === 'notifications') return false;
              if (currentRole === 'Production Team') {
                return ['production_leads', 'production_calendar', 'crew_roster', 'staff_roster'].includes(tab.id);
              }
              return true;
            }).map((tab) => {
              const IconComponent = tab.icon;
              const isSelected = activeSubTab === tab.id;
              let label = tab.label;
              if (currentRole === 'Production Team') {
                if (tab.id === 'crew_roster') label = 'Production Staff';
              }
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    handleTabSelect('production');
                    handleSubTabSelect(tab.id as any);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl transition-all cursor-pointer border text-left ${
                    isSelected
                      ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-400 border-purple-500/30 font-bold'
                      : 'text-zinc-400 bg-transparent border-transparent hover:bg-zinc-900/50 hover:text-white hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComponent className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-purple-450' : 'text-zinc-500'}`} />
                    <span className="tracking-wide">
                      {label}
                      {tab.id === 'notifications' && unreadNotificationsCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-[9px] text-rose-400 font-bold border border-rose-500/30">
                          {unreadNotificationsCount}
                        </span>
                      )}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-purple-400">●</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      ) : activeTab === 'sales' || currentRole === 'Sales Team' ? (
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-850 p-4 space-y-4 shadow-xl relative animate-in fade-in duration-300">
          <div className="flex items-center justify-between pb-1 border-b border-zinc-850">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-400 font-mono flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
              <span>SALES WORKSPACE</span>
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>

          {/* Return button for Business Owner */}
          {currentRole === 'Business Owner' && (
            <button
              onClick={() => {
                handleTabSelect('dashboard');
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[10px] font-mono uppercase tracking-wider font-extrabold rounded-xl transition-all duration-200 border cursor-pointer border-zinc-800 text-zinc-400 hover:bg-zinc-900/50 hover:text-white"
            >
              <span>←</span>
              <span>Back to Studio Desks</span>
            </button>
          )}

          <nav className="space-y-1.5">
            {[
              { id: 'sales_analytics', label: 'Sales Analytics', icon: Briefcase, color: 'text-indigo-400' },
              { id: 'sales_list', label: 'Leads Directory', icon: Sparkles, color: 'text-emerald-400' },
              { id: 'sales_calendar', label: 'Sales Calendar', icon: Calendar, color: 'text-blue-400' },
              { id: 'sales_packages', label: 'Package Catalog', icon: Layers, color: 'text-teal-400' },
              { id: 'custom_package_master', label: 'Custom Package Master', icon: Layers, color: 'text-amber-400' },
              { id: 'pending_payments', label: 'Pending Payment Report', icon: DollarSign, color: 'text-amber-500' },
              { id: 'notifications', label: 'Notifications', icon: Bell, color: 'text-rose-400' }
            ].filter(tab => !['sales_analytics', 'notifications'].includes(tab.id)).map(tab => {
              const IconComponent = tab.icon;
              let isSelected = false;
              if (tab.id === 'sales_list') isSelected = activeTab === 'sales' && activeSalesSubTab === 'list';
              else if (tab.id === 'sales_calendar') isSelected = activeTab === 'sales' && activeSalesSubTab === 'calendar';
              else if (tab.id === 'sales_packages') isSelected = activeTab === 'sales' && activeSalesSubTab === 'packages';
              else if (tab.id === 'custom_package_master') isSelected = activeTab === 'sales' && activeSalesSubTab === 'custom_package_master';
              else isSelected = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  id={`tab_${tab.id}`}
                  onClick={() => {
                    if (tab.id === 'sales_list') {
                      handleTabSelect('sales');
                      setActiveSalesSubTab('list');
                    } else if (tab.id === 'sales_calendar') {
                      handleTabSelect('sales');
                      setActiveSalesSubTab('calendar');
                    } else if (tab.id === 'sales_packages') {
                      handleTabSelect('sales');
                      setActiveSalesSubTab('packages');
                    } else if (tab.id === 'custom_package_master') {
                      handleTabSelect('sales');
                      setActiveSalesSubTab('custom_package_master');
                    } else {
                      handleTabSelect(tab.id);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 text-left border cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-zinc-700 font-bold shadow-md'
                      : 'text-zinc-400 bg-transparent border-transparent hover:bg-zinc-900/50 hover:text-white hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComponent className={`w-4 h-4 flex-shrink-0 ${tab.color}`} />
                    <span className="tracking-wide">
                      {tab.label}
                      {tab.id === 'notifications' && unreadNotificationsCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-[9px] text-rose-400 font-bold border border-rose-500/30">
                          {unreadNotificationsCount}
                        </span>
                      )}
                    </span>
                  </div>
                  <ChevronRightIcon active={isSelected} />
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
        <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl border border-zinc-850 p-4 space-y-4 shadow-xl relative animate-in fade-in duration-300">
          {/* Corner calibration tick marks */}
          <div className="absolute top-2 left-2 w-1 h-1 bg-amber-500/50" />
          <div className="absolute top-2 right-2 w-1 h-1 bg-amber-500/50" />
          <div className="absolute bottom-2 left-2 w-1 h-1 bg-amber-500/50" />
          <div className="absolute bottom-2 right-2 w-1 h-1 bg-amber-500/50" />

          <div className="flex items-center justify-between pb-1 border-b border-zinc-850">
            <h3 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-zinc-400 font-mono flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-amber-500" />
              <span>COMMAND CENTER</span>
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <nav className="space-y-1.5">
            {[
              { id: 'owner_overview', label: '1. Business Overview', icon: LayoutDashboard, color: 'text-amber-400' },
              { id: 'owner_calendar', label: '2. Event Calendar', icon: Calendar, color: 'text-purple-400' },
              { id: 'owner_approval', label: '3. Waiting Approval', icon: ShieldCheck, color: 'text-emerald-400', badge: pendingApprovalCount > 0 ? pendingApprovalCount : null },
              { id: 'owner_summary', label: '4. Revenue Summary', icon: FileText, color: 'text-blue-400', badge: pendingPaymentApprovalCount > 0 ? pendingPaymentApprovalCount : null },
              { id: 'owner_leads_report', label: '5. Leads Report', icon: FileText, color: 'text-cyan-400' },
              { id: 'owner_staff_performance', label: '📊 6. Staff Performance', icon: BarChart3, color: 'text-pink-400' },
              { id: 'sales_staff_management', label: '7. Sales Staff Management', icon: Users, color: 'text-indigo-400' },
              { id: 'password_reset', label: 'Password Reset', icon: Shield, color: 'text-rose-400' }
            ].map((tab) => {
              const IconComponent = tab.icon;
              const isSelected = activeTab === tab.id;
              const isApprovalHighlighted = tab.id === 'owner_approval' && pendingApprovalCount > 0;
              const isRevenueHighlighted = tab.id === 'owner_summary' && pendingPaymentApprovalCount > 0;
              const isHighlighted = isApprovalHighlighted || isRevenueHighlighted;
              return (
                <button
                  key={tab.id}
                  id={`tab_${tab.id}`}
                  onClick={() => handleTabSelect(tab.id as any)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 text-left border cursor-pointer border-transparent ${
                    isSelected
                      ? 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-zinc-700 font-bold shadow-md'
                      : isHighlighted
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                        : 'text-zinc-400 bg-transparent hover:bg-zinc-900/50 hover:text-white hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IconComponent className={`w-4 h-4 flex-shrink-0 ${isHighlighted && !isSelected ? 'text-amber-400' : tab.color}`} />
                    <span className="tracking-wide">
                      {tab.label}
                      {tab.id === 'notifications' && unreadNotificationsCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-[9px] text-rose-400 font-bold border border-rose-500/30">
                          {unreadNotificationsCount}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tab.badge && (
                      <span className="bg-amber-500 text-black px-2 py-0.5 rounded-full text-[10px] font-black animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                        {tab.badge}
                      </span>
                    )}
                    <ChevronRightIcon active={isSelected} />
                  </div>
                </button>
              );
            })}
          </nav>
          
          {/* Divider replaced with subtle spacer at bottom of nav */}
          <div className="my-1" />
        </div>
      )}
    </aside>
    );
  };

  return (
    <>
      {showInitialLoader && (
        <StudioLoader 
          onComplete={() => setShowInitialLoader(false)} 
          isLoading={isDataLoading} 
        />
      )}
      <div className="min-h-screen bg-[#030303] text-zinc-100 flex flex-col font-sans antialiased">
      
      {/* Platform Header with collapsible controller */}
      <RoleSwitcher sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Main Container */}
      <div className="flex-1 max-w-7xl 2xl:max-w-screen-2xl min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2400px] min-[3840px]:max-w-[3200px] w-full mx-auto p-2 sm:p-3 md:p-4 lg:p-4 flex flex-col lg:flex-row gap-4 relative">
        
        {/* DESKTOP SIDEBAR PANEL */}
        {sidebarOpen && (
          <div className="hidden lg:block flex-shrink-0 w-64 2xl:w-72 min-[1920px]:w-80 min-[2560px]:w-96 transition-all duration-300">
            <div className="sticky top-20">
              {renderSidebarContent()}
            </div>
          </div>
        )}

        {/* MOBILE & TABLET SLIDE-OUT DRAWER */}
        <div 
          className={`fixed inset-y-0 left-0 h-full z-50 bg-[#060608]/95 border-r border-zinc-900 shadow-2xl flex flex-col p-4 overflow-y-auto duration-300 ease-in-out transition-all lg:hidden ${
            sidebarOpen 
              ? 'translate-x-0 w-full sm:w-[320px]' 
              : '-translate-x-full w-full sm:w-[320px]'
          }`}
        >
          {renderSidebarContent()}
        </div>

        {/* OVERLAY BACKDROP FOR DRAWER */}
        {sidebarOpen && (
          <div 
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs z-40 lg:hidden transition-all duration-300"
          />
        )}

        {/* Right Side: Active Workspace panel */}
        <main className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Dashboard Header - Global Filter Section */}
          {['sales_analytics', 'operations_analytics', 'production_analytics', 'business_overview_analytics', 'owner_team_performance', 'owner_revenue', 'owner_calendar', 'owner_reports'].includes(activeTab) && (
            <div id="global_date_filter_header" className="bg-zinc-950/70 border border-zinc-900 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 font-mono">
                    Global Temporal Range
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-sans">
                    Refined analytical bound parameters: <span className="text-amber-400 font-bold font-mono">{globalDateRange.start}</span> to <span className="text-amber-400 font-bold font-mono">{globalDateRange.end}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 uppercase font-bold text-[10px]">Start Date:</span>
                  <input
                    type="date"
                    id="filter_start_date"
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    className="bg-zinc-900/95 border border-zinc-800 rounded-xl px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono text-xs cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 uppercase font-bold text-[10px]">End Date:</span>
                  <input
                    type="date"
                    id="filter_end_date"
                    value={endInput}
                    onChange={(e) => setEndInput(e.target.value)}
                    className="bg-zinc-900/95 border border-zinc-800 rounded-xl px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono text-xs cursor-pointer"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    id="btn_apply_filter"
                    onClick={() => setGlobalDateRange({ start: startInput, end: endInput })}
                    className="px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/50 transition-all font-bold cursor-pointer hover:shadow-[0_0_12px_rgba(245,158,11,0.08)] text-[11px] uppercase tracking-wider h-9"
                  >
                    Apply Filter
                  </button>
                  <button
                    id="btn_reset_filter"
                    onClick={() => {
                      resetGlobalDateRange();
                    }}
                    className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200 hover:border-zinc-700 transition-all font-bold cursor-pointer text-[11px] uppercase tracking-wider h-9"
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Render Active View Container */}
          <div className="bg-transparent rounded-2xl relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -12, filter: 'blur(3px)' }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="will-change-transform"
              >
                {!isTabAllowed(activeTab) ? (
                  <AccessDeniedView section={activeTab.split('_').join(' ').toUpperCase()} />
                ) : (
                  <>
                    {['owner_overview', 'owner_calendar', 'owner_approval', 'owner_summary', 'owner_leads_report', 'owner_revenue', 'owner_sales_report', 'owner_staff_performance', 'password_reset'].includes(activeTab) && (
                      <BusinessOwnerDashboard activeSection={activeTab} onSectionChange={(sec) => setActiveTab(sec as any)} />
                    )}
                    {activeTab === 'sales_analytics' && <SalesAnalytics />}
                    {activeTab === 'pending_payments' && (currentRole === 'Business Owner' || currentRole === 'Sales Team') && <PendingPaymentsReport />}
                    {activeTab === 'operations_analytics' && <OperationsAnalytics />}
                    {activeTab === 'production_analytics' && <ProductionAnalytics />}
                    {activeTab === 'business_overview_analytics' && <BusinessOverviewAnalytics />}
                    {activeTab === 'revenue_analytics' && <BusinessOverviewAnalytics />}
                    {activeTab === 'staff_performance_analytics' && <ProductionModule activeSubTab="staff_performance" />}
                    {activeTab === 'dashboard' && currentRole === 'Business Owner' && <BusinessOwnerDashboard activeSection="overview" onSectionChange={(sec) => setActiveTab(sec as any)} />}
                    {activeTab === 'sales' && (currentRole === 'Business Owner' || currentRole === 'Sales Team') && <SalesDashboardModule activeSubTab={activeSalesSubTab} setActiveSubTab={setActiveSalesSubTab} />}
                    {activeTab === 'operations' && (currentRole === 'Business Owner' || currentRole === 'Operations Team') && (
                      <OperationsModule activeSubTab={activeOpSubTab} setActiveSubTab={setActiveOpSubTab} />
                    )}
                    {activeTab === 'production' && (currentRole === 'Business Owner' || currentRole === 'Production Team') && (
                      <>
                        <ProductionModule activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} />
                        <ProductionExtensionContainer />
                      </>
                    )}
                    {activeTab === 'staff_management' && (currentRole === 'Business Owner' || currentRole === 'Production Team') && <StaffManagementModule />}
                    {activeTab === 'notifications' && <NotificationsModule />}
                    {activeTab === 'payments' && (currentRole === 'Business Owner' || currentRole === 'Sales Team') && <PaymentsModule />}
                    {activeTab === 'search' && currentRole === 'Business Owner' && <OrderSearch />}
                    {activeTab === 'staff_dashboard' && (currentRole === 'Operation Staff' || (currentRole as string) === 'Operations Staff') && <StaffModule />}
                    {activeTab === 'staff_dashboard' && currentRole === 'Production Staff' && <ProductionStaffModule />}
                    {activeTab === 'staff_report' && (
                      currentRole === 'Production Staff'
                        ? <ProductionStaffReport onBack={() => setActiveTab('staff_dashboard')} />
                        : <OperationsStaffReport onBack={() => setActiveTab('staff_dashboard')} />
                    )}
                    {activeTab === 'sales_staff_management' && currentRole === 'Business Owner' && <SalesStaffManagementModule />}
                    {activeTab === 'users' && currentRole === 'Business Owner' && <UserManagementModule />}
                    {activeTab === 'diagnostics' && currentRole === 'Business Owner' && <DatabaseHealthModule />}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

      </div>
    </div>
    </>
  );
};

// Simple visual indicators helper for sidebar Buttons
const ChevronRightIcon: React.FC<{ active: boolean }> = ({ active }) => {
  return (
    <span className={`text-[10px] text-zinc-650 transition-transform duration-200 ${active ? 'translate-x-0.5 text-amber-400' : 'group-hover:translate-x-0.5'}`}>
      {active ? '●' : '›'}
    </span>
  );
};

export default function App() {
  return (
    <RoleProvider>
      <MainAppContent />
    </RoleProvider>
  );
}
