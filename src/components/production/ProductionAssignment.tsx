import React from 'react';

export interface ProductionAssignmentProps {
  taskId?: string;
  orderId?: string;
  currentAssigneeId?: string;
  assigneeType?: 'editor' | 'staff' | 'operations';
  availableStaff?: Array<{ id: string; name: string; role?: string; specialities?: string[] }>;
  onAssign?: (assigneeId: string, type: 'editor' | 'staff' | 'operations') => Promise<void> | void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ProductionAssignment: React.FC<ProductionAssignmentProps> = ({
  taskId,
  orderId,
  currentAssigneeId = '',
  assigneeType = 'editor',
  availableStaff = [],
  onAssign,
  isLoading = false,
  disabled = false,
  className = ''
}) => {
  const safeStaffList = Array.isArray(availableStaff) ? availableStaff : [];

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val && onAssign) {
      onAssign(val, assigneeType);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <select
        value={currentAssigneeId}
        onChange={handleSelect}
        disabled={disabled || isLoading}
        className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {safeStaffList.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name} {member.role ? `(${member.role})` : ''}
          </option>
        ))}
      </select>
      {isLoading && (
        <span className="text-xs text-indigo-400 animate-pulse">Assigning...</span>
      )}
    </div>
  );
};
