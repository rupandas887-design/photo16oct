import React from 'react';

export interface ProductionTaskActionsProps {
  taskId: string;
  currentStatus?: string;
  onUpdateStatus?: (taskId: string, newStatus: string) => Promise<void> | void;
  onStartEditing?: (taskId: string) => Promise<void> | void;
  onCompleteTask?: (taskId: string) => Promise<void> | void;
  onReassignTask?: (taskId: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ProductionTaskActions: React.FC<ProductionTaskActionsProps> = ({
  taskId,
  currentStatus = '',
  onUpdateStatus,
  onStartEditing,
  onCompleteTask,
  onReassignTask,
  isLoading = false,
  disabled = false,
  className = ''
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {onStartEditing && currentStatus !== 'Editing Started' && (
        <button
          type="button"
          onClick={() => onStartEditing(taskId)}
          disabled={disabled || isLoading}
          className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-50"
        >
          Start Editing
        </button>
      )}

      {onCompleteTask && currentStatus !== 'Project Completed' && (
        <button
          type="button"
          onClick={() => onCompleteTask(taskId)}
          disabled={disabled || isLoading}
          className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-50"
        >
          Mark Complete
        </button>
      )}

      {onReassignTask && (
        <button
          type="button"
          onClick={() => onReassignTask(taskId)}
          disabled={disabled || isLoading}
          className="bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30 px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-50"
        >
          Reassign
        </button>
      )}
    </div>
  );
};
