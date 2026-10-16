import React, { useState, useEffect, useRef } from 'react';
import { useRole } from './RoleContext';
import { Notification } from '../types';
import { formatDateTime } from '../utils';
import { 
  Bell, Check, Trash2, Clock, X, CheckSquare, AlertCircle, AlertTriangle, 
  CheckCircle2, Info, Eye, Sparkles, RefreshCw, Volume2, VolumeX, Archive
} from 'lucide-react';

export const NotificationBell: React.FC = () => {
  const { 
    notifications, 
    markNotificationRead, 
    markAllNotificationsRead, 
    deleteNotification,
    archiveNotification,
    refreshData,
    currentRole,
    production,
    rawFootage,
    orders
  } = useRole();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastNotificationCount, setLastNotificationCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter notifications based on role and archive status
  const visibleNotifs = notifications.filter(notif => {
    if (currentRole !== 'Business Owner') {
      if (notif.recipient_role !== currentRole && notif.recipient_role !== 'All') {
        return false;
      }
    }
    return !notif.is_archived;
  });

  // Sound alert on new notification
  useEffect(() => {
    if (visibleNotifs.length > lastNotificationCount) {
      if (soundEnabled && lastNotificationCount > 0) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
          audio.volume = 0.3;
          audio.play().catch(() => {});
        } catch (e) {
          console.log('Audio playback block by browser policy.');
        }
      }
    }
    setLastNotificationCount(visibleNotifs.length);
  }, [visibleNotifs.length, lastNotificationCount, soundEnabled]);

  // Auto Refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      refreshData();
    }, 15000); // Poll every 15s to keep things highly active
    return () => clearInterval(interval);
  }, [autoRefresh, refreshData]);

  // Unread badge count
  const unreadCount = visibleNotifs.filter(n => !n.read_status).length;

  // Sorting: Unread first, then by created_at DESC
  const sortedNotifs = [...visibleNotifs].sort((a, b) => {
    // Unread first
    const aUnread = !a.read_status;
    const bUnread = !b.read_status;
    if (aUnread && !bUnread) return -1;
    if (!aUnread && bUnread) return 1;

    // Then created_at DESC
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  const getPriorityColor = (priority?: string | null) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'text-red-400 border-red-500/30 bg-red-500/10';
      case 'medium':
        return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      default:
        return 'text-zinc-400 border-zinc-800 bg-zinc-900';
    }
  };

  // Hide Notification UI for this project
  return null;

  return (
    <div id="notification_bell_wrapper" className="relative font-sans" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        id="btn_notification_bell"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-xl border relative transition-all cursor-pointer flex items-center justify-center select-none touch-manipulation min-w-max min-h-[38px] ${
          isOpen 
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
        }`}
        title="View Notifications Dashboard"
      >
        <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'animate-bounce' : ''}`} />
        
        {/* Unread Badge Overlay */}
        {unreadCount > 0 && (
          <span 
            id="notification_unread_badge" 
            className="absolute -top-1 -right-1 min-w-max h-[18px] flex items-center justify-center px-1 text-[9px] font-black font-mono text-black bg-gradient-to-r from-red-500 to-amber-500 rounded-full border border-black animate-pulse"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* Bell Dropdown Dashboard Panel */}
      {isOpen && (
        <div 
          id="notification_bell_dropdown" 
          className="absolute right-0 mt-2.5 w-[360px] max-w-[calc(100vw-2rem)] bg-zinc-950 border border-zinc-900 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
        >
          {/* Dropdown Header */}
          <div className="p-4 border-b border-zinc-900 bg-zinc-900/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              <h4 className="text-xs font-black text-white font-mono uppercase tracking-wider">
                Live Notification Stream
              </h4>
            </div>
            
            <div className="flex items-center gap-1">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-1 rounded text-[10px] hover:bg-zinc-900 transition-colors ${soundEnabled ? 'text-amber-450' : 'text-zinc-650'}`}
                title={soundEnabled ? "Mute audio alert" : "Enable audio alert"}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Auto Refresh Config */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`p-1 rounded text-[10px] font-mono hover:bg-zinc-900 transition-colors ${autoRefresh ? 'text-emerald-400 font-bold' : 'text-zinc-500'}`}
                title="Toggle Automated Refresh"
              >
                <span className="text-[8px] tracking-widest uppercase">{autoRefresh ? 'AUTO' : 'MANUAL'}</span>
              </button>
            </div>
          </div>

          {/* Quick Stats Panel */}
          <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-900 flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span>Role Filter: <strong className="text-zinc-200">{currentRole}</strong></span>
            {unreadCount > 0 && (
              <button 
                id="btn_mark_all_read"
                onClick={markAllNotificationsRead}
                className="text-amber-400 hover:text-amber-300 font-bold transition-all uppercase text-[9px] tracking-wider"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications Scroll Area */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-900">
            {sortedNotifs.length > 0 ? (
              sortedNotifs.map((notif) => {
                const isUnread = !notif.read_status;
                return (
                  <div 
                    key={notif.notification_id}
                    onClick={() => setSelectedNotif(notif)}
                    className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer relative group ${
                      isUnread 
                        ? 'bg-red-500/[0.02] hover:bg-red-500/[0.05]' 
                        : 'bg-transparent hover:bg-zinc-900/40'
                    }`}
                  >
                    {/* Unread vertical bar indicator */}
                    {isUnread && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                    )}

                    {/* Notification Type Icon */}
                    <div className={`p-1.5 rounded-lg border flex-shrink-0 mt-0.5 ${
                      isUnread 
                        ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                    }`}>
                      {notif.notification_type === 'Due Date Alert' ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : notif.notification_type === 'New Lead Received' || notif.notification_type === 'Lead Assigned' ? (
                        <Sparkles className="w-3.5 h-3.5" />
                      ) : (
                        <Info className="w-3.5 h-3.5" />
                      )}
                    </div>

                    {/* Text block */}
                    <div className="flex-1 space-y-0.5 text-left">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] font-bold tracking-tight line-clamp-1 ${isUnread ? 'text-white font-extrabold' : 'text-zinc-300'}`}>
                          {notif.title}
                        </span>
                        
                        {notif.priority && notif.priority !== 'Medium' && (
                          <span className={`text-[8px] px-1 py-0.5 rounded font-mono border leading-none ${getPriorityColor(notif.priority)}`}>
                            {notif.priority}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[10.5px] text-zinc-400 leading-normal line-clamp-2">
                        {notif.message}
                      </p>

                      <div className="flex items-center gap-2 pt-1 font-mono text-[8px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {notif.created_at ? formatDateTime(notif.created_at) : 'Just now'}
                        </span>
                        <span>•</span>
                        <span className="uppercase text-[7px] bg-zinc-900 px-1 py-0.2 rounded border border-zinc-850">
                          {notif.notification_type}
                        </span>
                      </div>
                    </div>

                    {/* Side Action Panel */}
                    <div className="flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isUnread && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markNotificationRead(notif.notification_id);
                          }}
                          className="p-1 rounded bg-zinc-900 hover:bg-emerald-950/40 text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveNotification(notif.notification_id);
                        }}
                        className="p-1 rounded bg-zinc-900 hover:bg-amber-950/40 text-zinc-400 hover:text-amber-400 border border-zinc-800 transition-colors"
                        title="Archive notification"
                      >
                        <Archive className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.notification_id);
                        }}
                        className="p-1 rounded bg-zinc-900 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 border border-zinc-800 transition-colors"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-zinc-500 uppercase font-mono text-xs">
                Stream empty. No alerts.
              </div>
            )}
          </div>

          {/* Quick Refresh Status Bar */}
          <div className="p-3 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center text-[9px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
              {autoRefresh ? 'Auto Syncing Stream' : 'Live updates idle'}
            </span>
            <button 
              onClick={() => refreshData()}
              className="text-zinc-400 hover:text-white flex items-center gap-1 uppercase transition-colors"
              title="Force Refresh Data Now"
            >
              <RefreshCw className="w-3 h-3 hover:rotate-180 duration-300 transition-all" />
              <span>SYNC</span>
            </button>
          </div>
        </div>
      )}

      {/* Full Modal Viewer for Details */}
      {selectedNotif && (() => {
        const prodItem = production.find(p => p.production_id === selectedNotif.project_id);
        const rfItem = prodItem ? rawFootage.find(rf => rf.tracking_id === prodItem.tracking_id) : null;
        const linkedOrder = rfItem ? orders.find(o => o.order_id === rfItem.order_id) : null;

        return (
          <div id="bell_notification_detail_modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl w-full w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
              
              {/* Header */}
              <div className="p-4 border-b border-zinc-900 bg-zinc-900/40 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500 animate-pulse" />
                  <h3 className="text-xs font-black text-white font-mono uppercase tracking-wider">
                    Alert Detail Dossier
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedNotif(null)}
                  className="p-1 text-zinc-400 hover:text-white rounded hover:bg-zinc-900 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4 text-xs text-left">
                {/* Text Block */}
                <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-850 space-y-1.5">
                  <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest flex justify-between">
                    <span>Title Log Summary</span>
                    {selectedNotif.priority && (
                      <span className={`text-[8px] px-1.5 py-0.2 rounded font-mono border leading-none ${getPriorityColor(selectedNotif.priority)}`}>
                        {selectedNotif.priority}
                      </span>
                    )}
                  </div>
                  <strong className="text-sm font-bold text-white block leading-tight">{selectedNotif.title}</strong>
                  <p className="text-[11.5px] text-zinc-400 leading-relaxed font-sans mt-1">{selectedNotif.message}</p>
                </div>

                {/* Metadata Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
                  <div className="p-3 bg-zinc-900/20 border border-zinc-900 rounded-lg">
                    <span className="text-[8px] uppercase font-mono tracking-wider text-zinc-500 block">Recipient Role</span>
                    <strong className="text-xs font-bold text-white block mt-0.5">{selectedNotif.recipient_role || 'All'}</strong>
                  </div>
                  <div className="text-left p-3 bg-zinc-900/20 border border-zinc-900 rounded-lg">
                    <span className="text-[8px] uppercase font-mono tracking-wider text-zinc-500 block">Created Timestamp</span>
                    <strong className="text-xs font-bold text-white block mt-0.5">
                      {selectedNotif.created_at ? formatDateTime(selectedNotif.created_at) : 'N/A'}
                    </strong>
                  </div>

                  {selectedNotif.notification_type && (
                    <div className="p-3 bg-zinc-900/20 border border-zinc-900 rounded-lg col-span-2">
                      <span className="text-[8px] uppercase font-mono tracking-wider text-zinc-500 block">Notification Type Category</span>
                      <strong className="text-xs font-bold text-amber-400 font-mono block mt-0.5">{selectedNotif.notification_type}</strong>
                    </div>
                  )}

                  {linkedOrder && (
                    <div className="p-3 bg-zinc-900/20 border border-zinc-900 rounded-lg col-span-2 space-y-1">
                      <span className="text-[8px] uppercase font-mono tracking-wider text-zinc-500 block">Associated Customer Project</span>
                      <div className="flex items-center justify-between text-xs">
                        <strong className="text-white block">{linkedOrder.customer_name}</strong>
                        <span className="text-zinc-400 font-mono font-bold text-[10px] bg-zinc-900 px-1.5 py-0.5 rounded">
                          {linkedOrder.package_name}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* DB Info */}
                <div className="p-3 bg-zinc-900/30 border border-zinc-900 rounded-xl space-y-1 text-zinc-400 font-mono text-[9px] uppercase">
                  <div className="flex justify-between">
                    <span>Notification ID:</span>
                    <span className="text-zinc-200 font-bold">{selectedNotif.notification_id}</span>
                  </div>
                  {selectedNotif.project_id && (
                    <div className="flex justify-between">
                      <span>Production ID:</span>
                      <span className="text-zinc-200 font-bold">{selectedNotif.project_id}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-zinc-900/40 border-t border-zinc-900 flex justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      deleteNotification(selectedNotif.notification_id);
                      setSelectedNotif(null);
                    }}
                    className="px-3.5 py-2 hover:bg-red-950/20 text-red-400 hover:text-red-300 border border-zinc-800 hover:border-red-500/20 text-[10px] font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer"
                  >
                    Delete Alert
                  </button>
                  <button
                    onClick={() => {
                      archiveNotification(selectedNotif.notification_id);
                      setSelectedNotif(null);
                    }}
                    className="px-3.5 py-2 hover:bg-amber-950/20 text-amber-400 hover:text-amber-300 border border-zinc-800 hover:border-amber-500/20 text-[10px] font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer"
                  >
                    Archive Alert
                  </button>
                </div>
                <div className="flex gap-2">
                  {selectedNotif.read_status === false && (
                    <button
                      onClick={() => {
                        markNotificationRead(selectedNotif.notification_id);
                        setSelectedNotif(null);
                      }}
                      className="px-4 py-2 bg-gradient-to-r from-red-600 to-orange-650 hover:opacity-90 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl cursor-pointer shadow transition-all flex items-center gap-1.5"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Verify Alert</span>
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedNotif(null)}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[10px] font-mono font-bold uppercase rounded-lg transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};
