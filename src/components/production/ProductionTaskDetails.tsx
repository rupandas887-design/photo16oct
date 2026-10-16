import React from 'react';

export interface ProductionTaskDetailsProps {
  task?: {
    id: string;
    title?: string;
    orderId?: string;
    clientName?: string;
    status?: string;
    editorName?: string;
    deadline?: string;
    notes?: string;
    deliverables?: string[];
    footageUrl?: string;
  } | null;
  onClose?: () => void;
  className?: string;
}

export const ProductionTaskDetails: React.FC<ProductionTaskDetailsProps> = ({
  task,
  onClose,
  className = ''
}) => {
  if (!task) return null;

  const safeDeliverables = Array.isArray(task.deliverables) ? task.deliverables : [];

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <h4 className="text-sm font-semibold text-zinc-100">{task.title || `Task #${task.id}`}</h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-0.5 rounded bg-zinc-800"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Order ID:</span>{' '}
          <span className="text-zinc-200 font-mono">{task.orderId || 'N/A'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Client:</span>{' '}
          <span className="text-zinc-200">{task.clientName || 'N/A'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Status:</span>{' '}
          <span className="text-indigo-400 font-medium">{task.status || 'Pending'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Editor:</span>{' '}
          <span className="text-zinc-200">{task.editorName || 'Unassigned'}</span>
        </div>
      </div>

      {task.notes && (
        <div className="text-xs">
          <span className="text-zinc-500 block mb-1">Notes:</span>
          <p className="bg-zinc-950 p-2 rounded text-zinc-300 border border-zinc-850">{task.notes}</p>
        </div>
      )}

      {safeDeliverables.length > 0 && (
        <div className="text-xs">
          <span className="text-zinc-500 block mb-1">Deliverables:</span>
          <ul className="list-disc list-inside text-zinc-300 space-y-0.5">
            {safeDeliverables.map((item: any, idx) => {
              let label = '';
              if (item === null || item === undefined) label = '';
              else if (typeof item === 'string') label = item;
              else if (typeof item === 'object') {
                const name = item.name || item.text || item.deliverable || item.title || '';
                const qty = item.qty || item.quantity || item.count || 1;
                label = name ? (Number(qty) > 1 ? `${qty} × ${name}` : String(name)) : '';
              } else {
                label = String(item);
              }
              if (!label) return null;
              return <li key={idx}>{label}</li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
