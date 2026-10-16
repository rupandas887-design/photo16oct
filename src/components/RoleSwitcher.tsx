import React, { useState, useMemo } from 'react';
import { useRole } from './RoleContext';
import { Menu, RefreshCw, LogOut, Github } from 'lucide-react';
import { AppLogo } from './AppLogo';
import { NotificationBell } from './NotificationBell';
import { GitHubPublishModal } from './GitHubPublishModal';
import { calculateStaffActiveBookingsCount } from '../utils';

interface RoleSwitcherProps {
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { 
    currentRole, 
    currentUser, 
    logout, 
    refreshData,
    staff = [],
    staffAssignments = [],
    leads = [],
    orders = [],
    operations = []
  } = useRole();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGitModalOpen, setIsGitModalOpen] = useState(false);

  const staffMember = (staff || []).find(s => 
    (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) || 
    (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email?.toLowerCase()) ||
    (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name?.trim().toLowerCase())
  );
  const staffName = staffMember?.name || currentUser?.name || '';
  
  const assignedTasksCount = useMemo(() => {
    if (!currentUser || !staffName || (currentRole !== 'Operation Staff' && currentRole !== 'Production Staff')) return 0;
    return calculateStaffActiveBookingsCount(staffName, staffAssignments, leads, orders, operations);
  }, [currentUser, staffName, currentRole, staffAssignments, leads, orders, operations]);

  if (!currentUser) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshData();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  return (
    <header className="bg-black/90 border-b border-zinc-900 backdrop-blur-md py-4 px-4 sm:px-6 sticky top-0 z-50 shadow-2xl font-sans">
      <div className="max-w-7xl 2xl:max-w-screen-2xl min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2400px] min-[3840px]:max-w-[3200px] w-full mx-auto flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left Side: Toggle (☰ Menu) & Logo */}
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          {setSidebarOpen && (
            <button
              id="header_sidebar_toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-805 rounded-xl transition-all cursor-pointer shadow-md select-none touch-manipulation min-w-max min-h-[38px]"
              title={sidebarOpen ? "Hide Navigation Sidebar" : "Show Navigation Sidebar"}
            >
              <Menu className="w-5 h-5 text-amber-500" />
            </button>
          )}
          
          <AppLogo size="sm" showTextOnFallback={false} />
        </div>

        {/* Assigned Tasks in Header (Desktop only - on mobile it appears in the side menu) */}
        {(currentRole === 'Operation Staff' || currentRole === 'Production Staff') && (
          <div className="hidden lg:flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 rounded-xl px-3.5 py-1.5 shadow-md">
            <span className="text-[10px] font-mono text-zinc-400 uppercase font-bold tracking-wider">
              Assigned Tasks
            </span>
            <span className="text-xs sm:text-sm font-black text-white bg-zinc-800/90 px-2 py-0.5 rounded-lg border border-zinc-700/60 font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {assignedTasksCount} Active
            </span>
          </div>
        )}

        {/* Right Side: GitHub, Refresh & Logout Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <NotificationBell />

          {/* GitHub button hidden from header as requested */}
          <button
            onClick={() => setIsGitModalOpen(true)}
            className="hidden p-2 sm:px-3 sm:py-1.5 items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/40 rounded-xl transition-all cursor-pointer shadow-md select-none touch-manipulation min-w-max min-h-[38px] sm:min-w-0 sm:min-h-0"
            title="Publish Code to GitHub"
            aria-hidden="true"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-mono font-bold uppercase tracking-wider">GitHub</span>
          </button>

          <button
            onClick={handleRefresh}
            className="p-2 sm:px-3 sm:py-1.5 flex items-center gap-2 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-400 hover:text-emerald-300 border border-emerald-500/15 hover:border-emerald-500/35 rounded-xl transition-all cursor-pointer shadow-md select-none touch-manipulation min-w-max min-h-[38px] sm:min-w-0 sm:min-h-0"
            title="Refresh System Flow"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline text-xs font-mono font-bold uppercase tracking-wider">Refresh</span>
          </button>

          <button
            onClick={() => logout()}
            className="p-2 sm:px-3 sm:py-1.5 flex items-center gap-2 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 border border-rose-500/15 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer shadow-md select-none touch-manipulation min-w-max min-h-[38px] sm:min-w-0 sm:min-h-0"
            title="Secure Logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-mono font-bold uppercase tracking-wider">Logout</span>
          </button>
        </div>

      </div>

      <GitHubPublishModal isOpen={isGitModalOpen} onClose={() => setIsGitModalOpen(false)} />
    </header>
  );
};
