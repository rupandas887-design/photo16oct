import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Clock, User, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRole } from './RoleContext';
import { supabaseClient } from '../supabaseClient';
import { formatDateDDMMYY, formatTime12Hour } from '../utils';

interface NoteHistory {
  id: string;
  lead_id: string;
  order_id?: string;
  remarks: string;
  changed_by: string;
  created_at: string;
}

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  orderId?: string;
  customerName: string;
}

export const AddNoteModal: React.FC<AddNoteModalProps> = ({ isOpen, onClose, leadId, orderId, customerName }) => {
  const { currentRole, currentUser, staff, productionStaff } = useRole();
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<NoteHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Compute author name
  let resolvedName = currentUser?.name;
  if (!resolvedName && currentUser?.email) {
    const s = [...(staff || []), ...(productionStaff || [])].find(x => x.email?.toLowerCase() === currentUser.email?.toLowerCase());
    if (s?.staff_name) {
      resolvedName = s.staff_name;
    }
  }
  const authorName = resolvedName || currentUser?.email?.split('@')[0] || currentRole || 'System';

  useEffect(() => {
    if (isOpen) {
      setNote('');
      fetchHistory();
      
      // Prevent background scrolling while modal is open
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, leadId, orderId]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      let query = supabaseClient
        .from('lead_status_history')
        .select('*')
        .eq('new_status', 'NOTE');

      // Filter notes strictly to this specific order (or the lead generally if no order exists)
      query = query.eq('lead_id', leadId);
      if (orderId) {
        query = query.or(`order_id.eq.${orderId},order_id.is.null`);
      } else {
        query = query.is('order_id', null);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (!error && data) {
        setHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!note.trim()) return;
    setIsSaving(true);
    
    try {
      const { data, error } = await supabaseClient.from('lead_status_history').insert({
        lead_id: leadId,
        order_id: orderId || null,
        old_status: 'NOTE',
        new_status: 'NOTE',
        changed_by: authorName,
        changed_by_role: currentRole,
        remarks: note.trim()
      }).select().single();

      if (!error && data) {
        setNote('');
        setHistory(prev => [data, ...prev]);
      }
    } catch (e) {
      console.error(e);
    }
    
    setIsSaving(false);
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto overflow-x-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-[calc(100vw-24px)] sm:max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] my-auto relative z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3.5 sm:p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/90 shrink-0 sticky top-0 z-10">
          <div className="min-w-0 pr-2">
            <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2 truncate">
              <FileText className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Add Note</span>
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5 truncate">For {customerName} {orderId ? `(${orderId})` : `(${leadId})`}</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 sm:p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Add Note Section */}
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">New Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter note..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 min-h-[100px] resize-y"
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={!note.trim() || isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider font-mono cursor-pointer shadow"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Add Note
                  </>
                )}
              </button>
            </div>
          </div>

          {/* History Section */}
          <div className="mt-2 space-y-3">
            <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-800/50 pb-2">NOTE HISTORY</h4>
            
            {isLoading ? (
              <div className="text-center py-6 text-zinc-500 text-xs flex items-center justify-center gap-2">
                <div className="w-3 h-3 border-2 border-zinc-500/30 border-t-zinc-500 rounded-full animate-spin" />
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-6 bg-zinc-900/30 border border-zinc-800/50 rounded-xl">
                <p className="text-zinc-500 text-xs">No notes found for this {orderId ? 'order' : 'lead'}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h) => {
                  const dateObj = new Date(h.created_at);
                  const displayDate = formatDateDDMMYY(dateObj);
                  const displayTime = formatTime12Hour(dateObj);

                  return (
                    <div key={h.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-bold text-zinc-200">
                          {h.changed_by || 'Unknown'} • {((h as any).changed_by_role) || 'System'}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed mb-1">
                        {h.remarks}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {displayDate}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {displayTime}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
