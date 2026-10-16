import React from 'react';

export const getStatusColorClass = (status: string) => {
  const s = status.toLowerCase().trim();
  if (s === 'create quote' || s === 'created quotation') return 'text-sky-400 font-semibold';
  if (s === 'quote sent') return 'text-purple-400 font-semibold';
  if (s === 'quote follow-up') return 'text-amber-400 font-semibold';
  if (s === 'confirm order' || s === 'order confirmed') return 'text-emerald-400 font-semibold';
  if (s === 'lead lost' || s === 'lost lead') return 'text-rose-500 font-bold';
  if (s === 'new lead') return 'text-white';
  if (s === 'contacted') return 'text-blue-500';
  if (s === 'follow-up' || s === 'follow up') return 'text-amber-500';
  if (s === 'quotation sent') return 'text-yellow-500';
  if (s === 'negotiation') return 'text-purple-500';
  if (s === 'order confirmed') return 'text-green-500';
  if (s === 'operations' || s === 'operations assigned') return 'text-cyan-500';
  if (s === 'assigned crew' || s === 'staff assigned') return 'text-indigo-400 font-semibold';
  if (s === 'event scheduled') return 'text-orange-500';
  if (s === 'event started') return 'text-amber-400 font-semibold';
  if (s === 'event ended' || s === 'event completed') return 'text-purple-400 font-semibold';
  if (s === 'footage handover') return 'text-cyan-400 font-semibold';
  if (s === 'verified footage' || s === 'footage handover verified') return 'text-emerald-400 font-semibold';
  if (s === 'raw footage received') return 'text-amber-500';
  if (s === 'production') return 'text-sky-500';
  if (s === 'assigned editor' || s === 'editor assigned') return 'text-sky-400 font-semibold';
  if (s === 'editing started') return 'text-yellow-400 font-semibold';
  if (s === 'editing in progress') return 'text-blue-400 font-semibold';
  if (s === 'customer review' || s === 'client review' || s === 'client review sent') return 'text-pink-400 font-semibold';
  if (s === 'editing completed') return 'text-teal-400 font-bold';
  if (s === 'client acceptance' || s === 'client accepted') return 'text-violet-400 font-bold';
  if (s === 'ready for delivery') return 'text-teal-500';
  if (s === 'delivered') return 'text-green-500';
  if (s === 'completed' || s === 'closed' || s === 'order closed') return 'text-green-400 font-bold';
  if (s === 'lost lead') return 'text-rose-500 font-bold';
  return 'text-zinc-400';
};

export const StatusText = ({ status, progress }: { status: string; progress?: string }) => {
  return (
    <span className={`font-medium ${getStatusColorClass(status)}`}>
      {status}{progress ? ` · ${progress}` : ''}
    </span>
  );
};
