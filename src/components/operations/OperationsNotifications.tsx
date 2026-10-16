import React from 'react';
import { useRole } from '../RoleContext';
import { 
  Bell, Check, MessageSquare, Info, AlertOctagon, Trash2
} from 'lucide-react';

import { formatDateTime } from '../../utils';

export const OperationsNotifications: React.FC = () => {
  const { notifications, markNotificationRead, deleteNotification, currentRole } = useRole();

  const canEdit = currentRole === 'Operations Team' || currentRole === 'Business Owner';

  // Filters notifications that mention keywords like booking, confirm, schedule, crew, photographer, videographer, operations
  const opsNotificationKeywords = ['booking', 'confirm', 'schedule', 'crew', 'photographers', 'operations', 'shoot', 'equipment', 'gear', 'raw', 'footage'];
  const filteredNotifications = notifications.filter(notif => {
    if (notif.is_archived) return false;
    const text = (notif.message + ' ' + (notif.title || '')).toLowerCase();
    return opsNotificationKeywords.some(keyword => text.includes(keyword));
  });

  const unreadCount = filteredNotifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    filteredNotifications.forEach(n => {
      if (!n.read) markNotificationRead(n.notification_id);
    });
    alert('All relevant operations notifications marked as read.');
  };

  // Hide Notification UI for this project
  return null;

  return (
    <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Notifications Header */}
      <div className="border-b border-zinc-850 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-mono font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-500" />
            <span>OPERATIONS NOTIFICATIONS NETWORK BOARD</span>
          </h3>
          <p className="text-[11px] text-zinc-450 mt-1 font-mono">
            Synchronized with live Supabase telemetry. Viewing {filteredNotifications.length} logs ({unreadCount} unread).
          </p>
        </div>

        {unreadCount > 0 && canEdit && (
          <button
            onClick={handleMarkAllRead}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mark All Reads</span>
          </button>
        )}
      </div>

      {/* Notifications Log */}
      <div className="divide-y divide-zinc-850/60 font-sans">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notif) => {
            const isUnread = !notif.read;
            const isAlert = notif.message.toLowerCase().includes('alert') || notif.message.toLowerCase().includes('conflict');
            
            return (
              <div 
                key={notif.notification_id} 
                className={`py-4 flex items-start justify-between gap-3 transition-colors ${
                  isUnread ? 'bg-amber-500/[0.02]' : ''
                }`}
              >
                <div className="flex gap-3">
                  <div className={`p-2.5 rounded-xl border flex-shrink-0 mt-0.5 ${
                    isUnread 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                      : 'bg-zinc-850/50 border-zinc-800 text-zinc-500'
                  }`}>
                    {isAlert ? <AlertOctagon className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`text-xs ${isUnread ? 'font-bold text-zinc-100' : 'text-zinc-400 font-medium'}`}>
                        {notif.title || 'Operations Bulletin'}
                      </h4>
                      {isUnread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </div>
                    <p className={`text-xs leading-relaxed ${isUnread ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
                      {notif.message}
                    </p>
                    <div className="text-[9px] text-zinc-550 font-mono">
                      Timestamp: {formatDateTime(notif.created_at) || 'Recent telemetry Log'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {isUnread && canEdit && (
                    <button
                      onClick={() => markNotificationRead(notif.notification_id)}
                      className="p-1 px-2.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 text-[10px] font-mono"
                      title="Acknowledge Reading"
                    >
                      Read
                    </button>
                    )}
                  {canEdit && (
                    <button
                      onClick={() => deleteNotification(notif.notification_id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg"
                      title="Purge Bulletin"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-zinc-550 italic font-mono text-xs">
            No bulletins recorded inside operational channels.
          </div>
        )}
      </div>
    </div>
  );
};
