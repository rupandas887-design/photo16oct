import React, { useState, useEffect, useMemo } from 'react';
import { Minus, Plus, Github } from 'lucide-react';
import { useRole } from './RoleContext';
import { AnimatedSalesGreeting } from './sales/AnimatedSalesGreeting';
import { GitHubPublishModal } from './GitHubPublishModal';

export interface DashboardGreetingHeaderProps {
  dashboardTitle: string;
  userName?: string;
  userMobile?: string;
  className?: string;
}

const ROLE_PLACEHOLDERS = [
  'Sales Team',
  'Operations Team',
  'Production Team',
  'Business Owner',
  'Operation Staff',
  'Operations Staff',
  'Production Staff',
  'Staff',
  'Admin',
  'User',
];

export const DashboardGreetingHeader: React.FC<DashboardGreetingHeaderProps> = ({
  dashboardTitle,
  userName,
  userMobile,
  className = '',
}) => {
  const { currentUser, currentUserName, users = [], staff = [], productionStaff = [] } = useRole();

  // Minimization state: initially expanded by default on every dashboard
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean>(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState<boolean>(false);

  // When dashboardTitle changes (e.g. navigation between dashboard views), reset to expanded
  useEffect(() => {
    setIsMinimized(false);
    setManuallyExpanded(false);
  }, [dashboardTitle]);

  // 8-second automatic minimization lifecycle
  useEffect(() => {
    // If user explicitly expanded the section, keep it expanded
    if (manuallyExpanded) return;

    // Start 8-second timer to minimize automatically
    const timerId = window.setTimeout(() => {
      setIsMinimized(true);
    }, 8000);

    // Safely clean up timer when component unmounts or navigates
    return () => {
      window.clearTimeout(timerId);
    };
  }, [dashboardTitle, manuallyExpanded]);

  // Manual Minimize
  const handleManualMinimize = () => {
    setManuallyExpanded(false);
    setIsMinimized(true);
  };

  // Manual Expand
  const handleManualExpand = () => {
    setManuallyExpanded(true);
    setIsMinimized(false);
  };

  // 1. Resolve user's actual display name
  const finalUserName = useMemo(() => {
    if (userName && !ROLE_PLACEHOLDERS.includes(userName.trim())) {
      return userName.trim();
    }
    if (currentUser?.name && !ROLE_PLACEHOLDERS.includes(currentUser.name.trim())) {
      return currentUser.name.trim();
    }
    if ((currentUser as any)?.full_name && !ROLE_PLACEHOLDERS.includes((currentUser as any).full_name.trim())) {
      return (currentUser as any).full_name.trim();
    }
    if (currentUserName && !ROLE_PLACEHOLDERS.includes(currentUserName.trim())) {
      return currentUserName.trim();
    }
    if (currentUser?.id || currentUser?.email || currentUser?.mobile) {
      const matchedUser = (users || []).find((u: any) =>
        (currentUser?.id && (u.id === currentUser.id || (u as any).auth_user_id === currentUser.id)) ||
        (currentUser?.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser?.mobile && u.mobile && u.mobile === currentUser.mobile)
      );
      if (matchedUser?.name && !ROLE_PLACEHOLDERS.includes(matchedUser.name.trim())) {
        return matchedUser.name.trim();
      }
      if (matchedUser?.full_name && !ROLE_PLACEHOLDERS.includes(matchedUser.full_name.trim())) {
        return matchedUser.full_name.trim();
      }
    }
    const allStaff = [...(staff || []), ...(productionStaff || [])];
    if (currentUser?.id || currentUser?.email || currentUser?.mobile) {
      const matchedStaff = allStaff.find((s: any) =>
        (currentUser?.id && s.staff_id === currentUser.id) ||
        (currentUser?.email && s.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser?.mobile && s.mobile && s.mobile === currentUser.mobile)
      );
      if (matchedStaff?.name && !ROLE_PLACEHOLDERS.includes(matchedStaff.name.trim())) {
        return matchedStaff.name.trim();
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const storedName = localStorage.getItem('erp_user_name');
        if (storedName && !ROLE_PLACEHOLDERS.includes(storedName.trim())) {
          return storedName.trim();
        }
        const storedUser = localStorage.getItem('erp_current_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed?.name && !ROLE_PLACEHOLDERS.includes(parsed.name.trim())) return parsed.name.trim();
          if (parsed?.full_name && !ROLE_PLACEHOLDERS.includes(parsed.full_name.trim())) return parsed.full_name.trim();
        }
      } catch {
        // ignore
      }
    }
    return userName || currentUserName || currentUser?.name || '';
  }, [userName, currentUser, currentUserName, users, staff, productionStaff]);

  const displayName = useMemo(() => {
    if (finalUserName && finalUserName.trim()) return finalUserName.trim();
    if (userName && userName.trim()) return userName.trim();
    if (currentUser?.name && currentUser.name.trim()) return currentUser.name.trim();
    if (currentUserName && currentUserName.trim()) return currentUserName.trim();
    return '';
  }, [finalUserName, userName, currentUser, currentUserName]);

  // 2. Resolve user's actual mobile number
  const finalMobile = useMemo(() => {
    if (userMobile && userMobile.trim()) return userMobile.trim();
    if (currentUser?.mobile && currentUser.mobile.trim()) return currentUser.mobile.trim();
    if ((currentUser as any)?.phone && (currentUser as any).phone.trim()) return (currentUser as any).phone.trim();
    const matchedUser = (users || []).find((u: any) =>
      (currentUser?.id && (u.id === currentUser.id || (u as any).auth_user_id === currentUser.id)) ||
      (currentUser?.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser?.name && u.name && u.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      (finalUserName && u.name && u.name.trim().toLowerCase() === finalUserName.toLowerCase())
    );
    if (matchedUser?.mobile && matchedUser.mobile.trim()) return matchedUser.mobile.trim();
    if ((matchedUser as any)?.phone && (matchedUser as any).phone.trim()) return (matchedUser as any).phone.trim();
    const allStaff = [...(staff || []), ...(productionStaff || [])];
    const matchedStaff = allStaff.find((s: any) =>
      (currentUser?.id && s.staff_id === currentUser.id) ||
      (currentUser?.email && s.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (currentUser?.name && s.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      (finalUserName && s.name && s.name.trim().toLowerCase() === finalUserName.toLowerCase())
    );
    if (matchedStaff?.mobile && matchedStaff.mobile.trim()) return matchedStaff.mobile.trim();
    if ((matchedStaff as any)?.phone && (matchedStaff as any).phone.trim()) return (matchedStaff as any).phone.trim();
    return '';
  }, [userMobile, currentUser, finalUserName, users, staff, productionStaff]);

  // Minimized View: compact header with dashboard name, logged-in user's name, and plus (+) button
  if (isMinimized && !manuallyExpanded) {
    return (
      <div 
        id={`welcome_minimized_${dashboardTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
        className={`select-none transition-all duration-200 py-0.5 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="leading-tight">
            <h1 className="text-sm sm:text-base font-bold text-white font-sans tracking-tight">
              {dashboardTitle}
            </h1>
            {displayName ? (
              <p className="text-xs sm:text-sm font-semibold text-amber-400 font-sans mt-0.5">
                {displayName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            id={`btn_expand_${dashboardTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
            onClick={handleManualExpand}
            className="inline-flex items-center justify-center w-6 h-6 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/80 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-zinc-700/60 shrink-0"
            title="Expand welcome section"
            aria-label="Expand welcome section"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400 hover:text-amber-400" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded View: normal welcome section with greeting, welcome message, mobile, and minus (-) button
  return (
    <div 
      id={`welcome_expanded_${dashboardTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
      className={`space-y-1 select-none transition-all duration-200 ${className}`}
    >
      {/* 1. Dashboard Heading row with minus (-) button & Publish to GitHub button */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-sm sm:text-base font-bold text-white font-sans tracking-tight">
          {dashboardTitle}
        </h1>
        <button
          type="button"
          id={`btn_minimize_${dashboardTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
          onClick={handleManualMinimize}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/80 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-zinc-700/60 shrink-0"
          title="Minimize welcome section"
          aria-label="Minimize welcome section"
        >
          <Minus className="w-3.5 h-3.5 text-zinc-400 hover:text-amber-400" />
        </button>

        <button
          type="button"
          onClick={() => setIsGitHubModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all cursor-pointer ml-auto"
          title="Publish code to GitHub"
        >
          <Github className="w-3.5 h-3.5" />
          <span>Publish to GitHub</span>
        </button>
      </div>

      {/* 2, 3, & 4. Greeting Details (hidden in minimized mode) */}
      <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:transition-none motion-reduce:animate-none">
        {/* 2 & 3. Animated Greeting Section (Time-Based Greeting + Personalized Welcome Message) */}
        <AnimatedSalesGreeting salesPersonName={finalUserName} />

        {/* 4. Logged-in User's Mobile Number (omitted if unavailable) */}
        {finalMobile ? (
          <p className="text-xs sm:text-sm font-mono text-zinc-400">
            {finalMobile}
          </p>
        ) : null}
      </div>

      <GitHubPublishModal isOpen={isGitHubModalOpen} onClose={() => setIsGitHubModalOpen(false)} />
    </div>
  );
};
