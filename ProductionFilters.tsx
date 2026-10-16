import React from 'react';

export interface ProductionFiltersProps {
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (status: string) => void;
  editorFilter?: string;
  onEditorFilterChange?: (editorId: string) => void;
  dateRange?: { start?: string; end?: string };
  onDateRangeChange?: (range: { start?: string; end?: string }) => void;
  onResetFilters?: () => void;
  statusOptions?: string[];
  editorOptions?: Array<{ id: string; name: string }>;
  className?: string;
}

export const ProductionFilters: React.FC<ProductionFiltersProps> = ({
  searchTerm = '',
  onSearchChange,
  statusFilter = 'ALL',
  onStatusFilterChange,
  editorFilter = 'ALL',
  onEditorFilterChange,
  onResetFilters,
  statusOptions = [],
  editorOptions = [],
  className = ''
}) => {
  const safeStatusOptions = Array.from(new Set(Array.isArray(statusOptions) ? statusOptions : []));
  const safeEditorOptions = Array.isArray(editorOptions) ? editorOptions : [];

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {onSearchChange && (
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search production tasks or orders..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {onStatusFilterChange && (
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Statuses</option>
          {safeStatusOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {onEditorFilterChange && (
        <select
          value={editorFilter}
          onChange={(e) => onEditorFilterChange(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">All Editors</option>
          {safeEditorOptions.map((ed) => (
            <option key={ed.id} value={ed.id}>
              {ed.name}
            </option>
          ))}
        </select>
      )}

      {onResetFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Reset Filters
        </button>
      )}
    </div>
  );
};
