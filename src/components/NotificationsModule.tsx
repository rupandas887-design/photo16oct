import React, { useState } from 'react';
import { useRole } from './RoleContext';
import { Notification } from '../types';
import { formatDateTime } from '../utils';
import { 
  Bell, AlertCircle, AlertTriangle, CheckCircle2, Info, Eye, Clock,
  Layers, User, Calendar, Trash2, ShieldAlert, Sparkles, X, Send, Play, CheckSquare, Search, Archive
} from 'lucide-react';

export const NotificationsModule: React.FC = () => {
  const { 
    notifications, 
    markNotificationRead, 
    markAllNotificationsRead,
    deleteNotification,
    deleteAllReadNotifications,
    archiveNotification,
    production, 
    orders, 
    rawFootage, 
    logs,
    currentRole 
  } = useRole();

  // Selected Notification for Details Modal
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null);

  // Pagination limit state
  const [visibleLimit, setVisibleLimit] = useState(20);

  // Filter Select State: 'All' | 'Task Assigned' | 'Task Completed' | 'Due Date Alert' | 'System Notification' (or type based matches)
  const [activeFilter, setActiveFilter] = useState<'All' | 'Task Assigned' | 'Task Completed' | 'Due Date Alert' | 'System Notification'>('All');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Show archived state
  const [showArchived, setShowArchived] = useState(false);

  // Handle marking read
  const handleMarkRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    markNotificationRead(id);
  };

  // Role-based visibility base list
  const visibleNotifications = notifications.filter(notif => {
    if (currentRole !== 'Business Owner') {
      if (notif.recipient_role !== currentRole && notif.recipient_role !== 'All') {
        return false;
      }
    }
    if (showArchived) {
      return !!notif.is_archived;
    } else {
      return !notif.is_archived;
    }
  });

  // Helper selectors
  const totalNotifications = visibleNotifications.length;
  const unreadCount = visibleNotifications.filter(n => !n.read_status).length;
  const readCount = totalNotifications - unreadCount;

  // Filtered list
  const filteredNotifications = visibleNotifications.filter(notif => {
    const matchesType = activeFilter === 'All' || notif.notification_type === activeFilter;
    if (!matchesType) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        notif.title.toLowerCase().includes(q) ||
        notif.message.toLowerCase().includes(q) ||
        (notif.notification_id || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getPriority = (expectedDate?: string, status?: string) => {
    if (status === 'Delivered') return 'Low';
    if (!expectedDate) return 'Medium';
    
    const todayStr = new Date().toISOString().split('T')[0];
    if (expectedDate < todayStr) return 'High';
    if (expectedDate === todayStr) return 'High';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    if (expectedDate === tomorrowStr) return 'High';

    return 'Medium';
  };

  // Hide Notification UI for this project
  return null;

  return (
    <div id="notifications_module" className="space-y-6 animate-fade-in font-sans">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 border border-zinc-900 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl" />
        
        <div className="space-y-1 z-10">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <span className="p-1 px-2 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-mono rounded tracking-widest uppercase animate-pulse">Alerts</span>
            <span>Production Notification Center</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5 font-mono">
            REAL-TIME COLLABORATIVE BROADCASTS, DUE DATE WARNINGS, AND WORKFLOW LOGS
          </p>
        </div>

        {/* Counter cards in header */}
        <div className="flex items-center gap-3 z-10">
          <div className="bg-zinc-900/80 border border-zinc-800 p-3 px-4 rounded-xl text-center min-w-max">
            <span className="text-[9px] text-zinc-500 font-mono block uppercase">Total Alerts</span>
            <span className="text-sm font-black text-white font-mono">{totalNotifications}</span>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 p-3 px-4 rounded-xl text-center min-w-max">
            <span className="text-[9px] text-red-400/80 font-mono block uppercase">Unread</span>
            <span className="text-sm font-black text-red-400 font-mono animate-pulse">{unreadCount}</span>
          </div>
        </div>
      </div>

      {/* Control panel & Tab selection */}
      <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Sub-tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-zinc-900/40 p-1 rounded-xl border border-zinc-900">
          {(['All', 'Task Assigned', 'Task Completed', 'Due Date Alert', 'System Notification'] as const).map((tab) => {
            const count = visibleNotifications.filter(n => tab === 'All' || n.notification_type === tab).length;
            const hasUnread = visibleNotifications.some(n => (!tab || n.notification_type === tab) && !n.read_status);
            
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveFilter(tab);
                }}
                className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === tab
                    ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 text-red-400 border border-red-500/30 shadow'
                    : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <span>{tab}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium ${
                  activeFilter === tab ? 'bg-red-950 text-red-300' : 'bg-zinc-900 text-zinc-500'
                }`}>
                  {count}
                </span>
                {hasUnread && tab !== 'All' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                )}
              </button>
            );
          })}
        </div>

        {/* Archived Toggle & Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-2 text-xs font-mono uppercase tracking-wider font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 border ${
              showArchived
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>{showArchived ? 'Viewing Archived' : 'View Archive'}</span>
          </button>

          {/* Search */}
          <div className="relative w-full md:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-500">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-150 font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Alerts Grid/List */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden shadow-xl">
        <h3 className="text-[10px] font-black text-zinc-450 uppercase tracking-[0.2em] border-b border-zinc-900 p-5 pb-3.5 font-mono flex flex-wrap items-center justify-between gap-3">
          <span>ALERTS & BROADCAST PIPELINE FLOW</span>
          <div className="flex items-center gap-4">
            <span className="text-[9px] text-zinc-500 hidden sm:inline">CLICK ALERT CARD FOR DEEP DETAILS & FLOW CONTEXT</span>
            {unreadCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markAllNotificationsRead();
                }}
                className="text-[9px] text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 px-2 py-1 rounded transition-colors cursor-pointer"
                title="Mark all notifications as read"
              >
                MARK ALL AS READ
              </button>
            )}
            {readCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteAllReadNotifications();
                }}
                className="text-[9px] text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 px-2 py-1 rounded transition-colors cursor-pointer font-bold"
                title="Delete all read notifications"
              >
                DELETE ALL READ
              </button>
            )}
          </div>
        </h3>

        <div className="divide-y divide-zinc-900">
          {filteredNotifications.slice(0, visibleLimit).map((notif) => {
            const isUnread = !notif.read_status;
            const type = notif.notification_type;
            
            return (
              <div
                key={notif.notification_id}
                onClick={() => {
                  // 1. Mark as read immediately if unread
                  if (isUnread) {
                    markNotificationRead(notif.notification_id);
                  }
                  
                  // 2. Open details modal
                  setSelectedNotifId(notif.notification_id);

                  // 3. Dispatch navigation custom event
                  const event = new CustomEvent('erp-notification-click', {
                    detail: {
                      notification_id: notif.notification_id,
                      project_id: notif.project_id,
                      notification_type: notif.notification_type,
                      recipient_role: notif.recipient_role,
                      related_record_id: notif.project_id
                    }
                  });
                  window.dispatchEvent(event);
                }}
                className={`p-5 flex items-start gap-4 transition-all cursor-pointer relative group ${
                  isUnread 
                    ? 'bg-red-950/[0.04] hover:bg-red-950/[0.08]' 
                    : 'bg-[#010101] hover:bg-zinc-900/40 text-zinc-400'
                }`}
              >
                {/* Unread indicator rail */}
                {isUnread && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                )}

                {/* Left icon wrapper */}
                <div className={`p-2 rounded-xl border flex-shrink-0 mt-0.5 ${
                  isUnread 
                    ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                    : 'bg-zinc-900 border-zinc-850 text-zinc-500'
                }`}>
                  {type === 'Due Date Alert' && <AlertTriangle className="w-4 h-4" />}
                  {type === 'Task Assigned' && <User className="w-4 h-4" />}
                  {type === 'Task Reassigned' && <Clock className="w-4 h-4 text-amber-400" />}
                  {type === 'Task Completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {type === 'Revision Requested' && <AlertCircle className="w-4 h-4 text-pink-400" />}
                  {type === 'Project Approved' && <Sparkles className="w-4 h-4 text-amber-500" />}
                  {type === 'Project Delivered' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {type === 'System Notification' && <Info className="w-4 h-4" />}
                </div>

                {/* Message Body */}
                <div className="flex-1 space-y-1 text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className={`text-xs font-bold leading-tight ${isUnread ? 'text-white' : 'text-zinc-300'}`}>
                      {notif.title}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-650" />
                      {formatDateTime(notif.created_at)}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-zinc-400 leading-relaxed max-w-4xl font-sans">
                    {notif.message}
                  </p>
                  
                  {/* Tag list */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[9px] text-zinc-500">
                    <span className="bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-400 leading-none">
                      {notif.notification_type}
                    </span>
                    {notif.project_id && (
                      <span className="bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-400 leading-none">
                        PROD: {notif.project_id}
                      </span>
                    )}
                    {notif.recipient_role && (
                      <span className="bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-500 leading-none">
                        ROLE: {notif.recipient_role}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action panel */}
                <div className="flex items-center gap-1.5 flex-shrink-0 self-center">
                  {isUnread && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotificationRead(notif.notification_id);
                      }}
                      className="px-2.5 py-1.5 border border-zinc-850 hover:border-emerald-500/30 hover:bg-emerald-950/20 text-[10px] uppercase font-mono font-bold text-zinc-400 hover:text-emerald-400 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      title="Mark alert as read"
                    >
                      <span>Read</span>
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveNotification(notif.notification_id, !notif.is_archived);
                    }}
                    className={`p-1.5 border rounded-lg transition-all cursor-pointer ${
                      notif.is_archived
                        ? 'border-amber-500/20 bg-amber-500/5 text-amber-400 hover:text-white hover:bg-amber-500/10'
                        : 'border-zinc-850 hover:border-amber-500/20 text-zinc-450 hover:text-amber-400 hover:bg-zinc-900'
                    }`}
                    title={notif.is_archived ? "Unarchive alert" : "Archive alert"}
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notif.notification_id);
                    }}
                    className="p-1.5 border border-zinc-850 hover:border-red-500/20 hover:bg-zinc-900 text-zinc-450 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredNotifications.length > visibleLimit && (
            <div className="p-4 flex justify-center bg-zinc-950 border-t border-zinc-900">
              <button
                onClick={() => setVisibleLimit(prev => prev + 20)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-mono font-bold text-zinc-300 hover:text-white transition-all cursor-pointer uppercase tracking-wider"
              >
                Load More Notifications
              </button>
            </div>
          )}

          {filteredNotifications.length === 0 && (
            <div className="py-20 text-center text-zinc-500 uppercase font-mono text-xs">
              No notifications matching current filter tab.
            </div>
          )}
        </div>
      </div>

      {/* DETAILED POPUP MODAL */}
      {selectedNotifId && (() => {
        const notif = notifications.find(n => n.notification_id === selectedNotifId);
        if (!notif) return null;

        // Trace and bind model states
        const prodItem = production.find(p => p.production_id === notif.project_id);
        const rfItem = prodItem ? rawFootage.find(rf => rf.tracking_id === prodItem.tracking_id) : null;
        const linkedOrder = rfItem ? orders.find(o => o.order_id === rfItem.order_id) : null;

        const orderId = linkedOrder?.order_id || 'N/A';
        const projName = linkedOrder?.package_name || 'N/A';
        const custName = linkedOrder?.customer_name || 'N/A';
        const assignedStaff = prodItem?.editor_assigned || 'Unassigned';
        const taskName = notif.task_id || 'Post Production Work';
        const currentStage = linkedOrder?.current_stage || 'N/A';
        const dueDate = prodItem?.expected_delivery_date || 'N/A';
        const status = prodItem?.editing_status || 'N/A';
        const priority = getPriority(prodItem?.expected_delivery_date, prodItem?.editing_status);
        const remarks = prodItem?.remarks || 'No notes currently logged on this processing file.';

        // Timeline: activity logs for this order
        const timeline = logs.filter(l => 
          l.metadata_reference === orderId || 
          l.metadata_reference === notif.project_id || 
          l.metadata_reference === (prodItem?.tracking_id || '')
        );

        return (
          <div id="notification_detail_modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-950 rounded-2xl w-full w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative flex flex-col border border-zinc-900">
              
              {/* Header */}
              <div className="p-5 border-b border-zinc-900 flex items-center justify-between bg-zinc-900/40 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-black text-white font-mono uppercase tracking-wider">
                    Alert Verification Detail Summary
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedNotifId(null)}
                  className="px-3 py-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white text-xs rounded-xl transition-all cursor-pointer border border-zinc-800 font-mono"
                >
                  Close
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 text-xs text-left">
                
                {/* Alert Quick Summary */}
                <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-850 space-y-2">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Notification Trigger Title</div>
                  <strong className="text-sm font-bold text-white block leading-tight">{notif.title}</strong>
                  <p className="text-[11px] text-zinc-450 leading-relaxed font-mono">{notif.message}</p>
                </div>

                {/* Two-Column Detail Block */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Project Name', val: projName, icon: Layers },
                    { label: 'Order ID', val: orderId, icon: Clock },
                    { label: 'Customer Name', val: custName, icon: User },
                    { label: 'Assigned Editor Staff', val: assignedStaff, icon: User },
                    { label: 'Task Component / Segment', val: taskName, icon: Info },
                    { label: 'Workflow ERP Stage', val: currentStage, icon: Clock },
                    { label: 'Expected Release Date', val: dueDate, icon: Calendar },
                    { label: 'Post-Prod Editing Status', val: status, icon: Info },
                  ].map((field, idx) => {
                    const Icon = field.icon;
                    return (
                      <div key={idx} className="p-3.5 bg-[#020202] border border-zinc-900 rounded-xl space-y-1">
                        <span className="text-[9px] uppercase font-mono tracking-wider text-zinc-500 block flex items-center gap-1">
                          <Icon className="w-3 h-3 text-zinc-650" />
                          <span>{field.label}</span>
                        </span>
                        <strong className="text-xs font-bold text-white block select-all">
                          {field.val}
                        </strong>
                      </div>
                    );
                  })}
                </div>

                {/* Priority Status Level block */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 bg-[#020202] border border-zinc-900 rounded-xl text-left space-y-1">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 block">Priority Level</span>
                    <strong className={`text-xs uppercase font-mono tracking-widest font-black ${
                      priority === 'High' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {priority}
                    </strong>
                  </div>
                  <div className="p-3.5 bg-[#020202] border border-zinc-900 rounded-xl text-left space-y-1">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 block">Review Condition</span>
                    <strong className="text-xs uppercase font-mono text-purple-400 font-bold">
                      {prodItem?.customer_review_status || 'Waiting on Files'}
                    </strong>
                  </div>
                </div>

                {/* File Director Folder Section */}
                {prodItem?.raw_footage_location && (
                  <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl text-left space-y-1.5">
                    <span className="text-[9px] uppercase font-mono text-zinc-500 block tracking-wider">Storage Directory Reference</span>
                    <strong className="text-[11px] font-mono text-zinc-300 break-all select-all block block">
                      {prodItem.raw_footage_location}
                    </strong>
                  </div>
                )}

                {/* Remarks Block */}
                <div className="p-4 bg-zinc-900/40 border border-zinc-850 rounded-xl text-left space-y-1.5">
                  <span className="text-[9px] uppercase font-mono text-zinc-500 block tracking-wider">Production Logs & Remarks</span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-sans block block">
                    "{remarks}"
                  </p>
                </div>

                {/* Complete Activity Timeline */}
                <div className="space-y-4">
                  <div className="text-[10px] font-mono font-black uppercase text-zinc-450 tracking-widest block border-b border-zinc-900 pb-2">
                    Complete Log & Activity Timeline
                  </div>
                  
                  <div className="space-y-3.5 relative pl-4 border-l border-zinc-850">
                    {timeline.length > 0 ? (
                      timeline.map((item, id) => (
                        <div key={item.log_id} className="relative text-left space-y-0.5">
                          {/* Circle dot */}
                          <div className="absolute -left-[20.5px] top-1 w-2.5 h-2.5 rounded-full bg-zinc-700 border-2 border-zinc-950" />
                          
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-zinc-300">{item.action}</span>
                            <span className="text-zinc-550 font-mono">{formatDateTime(item.timestamp)}</span>
                          </div>
                          <p className="text-[10.5px] text-zinc-500 leading-relaxed max-w-xl font-mono">
                            {item.details} 
                            {item.previous_state && (
                              <span className="text-zinc-600"> (Changed: {item.previous_state} → {item.new_state})</span>
                            )}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-zinc-650 font-mono block pl-2 text-[10px] uppercase">
                        No metadata tracking events logged on current project reference.
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Bottom footer bar with Mark read action */}
              {notif.read_status === false && (
                <div className="p-4 bg-zinc-900/60 border-t border-zinc-900 flex justify-end gap-2 pr-6">
                  <button
                    onClick={() => {
                      handleMarkRead(notif.notification_id);
                      setSelectedNotifId(null);
                    }}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-orange-650 hover:opacity-90 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl cursor-pointer shadow transition-all flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-4 h-4 ml-0.5 mt-0.5" />
                    <span>Mark Alert Verified & Verified</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
};
