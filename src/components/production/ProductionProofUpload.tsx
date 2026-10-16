import React, { useState } from 'react';

export interface ProductionProofUploadProps {
  taskId: string;
  orderId?: string;
  existingProofs?: Array<{ id: string; url: string; uploadedAt?: string; notes?: string }>;
  onUploadProof?: (taskId: string, fileOrUrl: string, notes?: string) => Promise<void> | void;
  onRemoveProof?: (taskId: string, proofId: string) => Promise<void> | void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ProductionProofUpload: React.FC<ProductionProofUploadProps> = ({
  taskId,
  orderId,
  existingProofs = [],
  onUploadProof,
  onRemoveProof,
  isLoading = false,
  disabled = false,
  className = ''
}) => {
  const [proofUrlInput, setProofUrlInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeProofs = Array.isArray(existingProofs) ? existingProofs : [];

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofUrlInput.trim() || !onUploadProof) return;
    try {
      setIsSubmitting(true);
      await onUploadProof(taskId, proofUrlInput.trim(), notesInput.trim());
      setProofUrlInput('');
      setNotesInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {safeProofs.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {safeProofs.map((proof) => (
            <div key={proof.id} className="relative group border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900 p-2">
              <img
                src={proof.url}
                alt="Proof"
                className="w-full h-24 object-cover rounded"
                referrerPolicy="no-referrer"
              />
              {proof.notes && (
                <p className="text-[10px] text-zinc-400 mt-1 truncate">{proof.notes}</p>
              )}
              {onRemoveProof && !disabled && (
                <button
                  type="button"
                  onClick={() => onRemoveProof(taskId, proof.id)}
                  className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {onUploadProof && (
        <form onSubmit={handleUploadSubmit} className="space-y-2">
          <input
            type="url"
            value={proofUrlInput}
            onChange={(e) => setProofUrlInput(e.target.value)}
            placeholder="Enter Proof Image / Drive URL"
            disabled={disabled || isLoading || isSubmitting}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Notes (optional)"
            disabled={disabled || isLoading || isSubmitting}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!proofUrlInput.trim() || disabled || isLoading || isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-1.5 px-3 rounded-lg text-xs transition-colors"
          >
            {isSubmitting ? 'Uploading...' : 'Upload Task Proof'}
          </button>
        </form>
      )}
    </div>
  );
};
