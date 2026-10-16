import React, { useState } from 'react';

export interface ProductionReassignProps {
  taskId: string;
  currentEditorId?: string;
  currentEditorName?: string;
  editorsList?: Array<{ id: string; name: string }>;
  onConfirmReassign?: (taskId: string, newEditorId: string, reason?: string) => Promise<void> | void;
  onCancel?: () => void;
  isLoading?: boolean;
  className?: string;
}

export const ProductionReassign: React.FC<ProductionReassignProps> = ({
  taskId,
  currentEditorName = 'Unassigned',
  editorsList = [],
  onConfirmReassign,
  onCancel,
  isLoading = false,
  className = ''
}) => {
  const [selectedEditorId, setSelectedEditorId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeEditors = Array.isArray(editorsList) ? editorsList : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEditorId || !onConfirmReassign) return;
    try {
      setIsSubmitting(true);
      await onConfirmReassign(taskId, selectedEditorId, reason.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 ${className}`}>
      <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Reassign Production Task</h4>
      <p className="text-xs text-zinc-400">Current Editor: <span className="text-zinc-200">{currentEditorName}</span></p>

      <div>
        <label className="block text-[11px] text-zinc-400 mb-1">Select New Editor</label>
        <select
          value={selectedEditorId}
          onChange={(e) => setSelectedEditorId(e.target.value)}
          disabled={isLoading || isSubmitting}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="">-- Choose Editor --</option>
          {safeEditors.map((ed) => (
            <option key={ed.id} value={ed.id}>{ed.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] text-zinc-400 mb-1">Reason for Reassignment (Optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Heavy workload, leave..."
          disabled={isLoading || isSubmitting}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading || isSubmitting}
            className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!selectedEditorId || isLoading || isSubmitting}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded transition-colors"
        >
          {isSubmitting ? 'Reassigning...' : 'Confirm Reassign'}
        </button>
      </div>
    </form>
  );
};
