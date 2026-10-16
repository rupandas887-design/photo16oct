import React, { useState, useEffect } from 'react';
import { AddNoteModal } from '../AddNoteModal';
import { useRole } from '../RoleContext';

export const ProductionNoteManager: React.FC = () => {
  const { production, orders, leads } = useRole();
  const [noteModalState, setNoteModalState] = useState<{
    isOpen: boolean;
    leadId: string;
    orderId: string;
    customerName: string;
  }>({
    isOpen: false,
    leadId: '',
    orderId: '',
    customerName: ''
  });

  useEffect(() => {
    const handleCaptureClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const btn = target.closest('button');
      if (!btn) return;

      const btnText = (btn.textContent || '').trim();
      if (btnText.includes('VIEW/ADD NOTE') || btnText.includes('Add Note') || btnText.includes('View/Add Note')) {
        const dropdown = document.getElementById('production-action-dropdown') || target.closest('#production-action-dropdown');
        if (dropdown) {
          const headerSpans = Array.from(dropdown.querySelectorAll('span'));
          const idSpan = headerSpans.find(s => s.textContent?.includes('ID:'));
          const rawIdText = idSpan ? (idSpan.textContent || '').replace('ID:', '').trim() : '';

          if (rawIdText) {
            const prodItem = (production || []).find(
              p => p.tracking_id === rawIdText || p.production_id === rawIdText || (p as any).order_id === rawIdText
            );

            const targetOrder = (orders || []).find(
              o => o.order_id === rawIdText || 
                   o.order_id === prodItem?.order_id || 
                   o.lead_id === rawIdText || 
                   o.lead_id === prodItem?.tracking_id || 
                   o.lead_id === prodItem?.lead_id
            );

            const targetLead = (leads || []).find(
              l => l.lead_id === rawIdText || 
                   l.lead_id === prodItem?.tracking_id || 
                   l.lead_id === targetOrder?.lead_id || 
                   l.lead_id === prodItem?.lead_id
            );

            const finalLeadId = targetOrder?.lead_id || targetLead?.lead_id || prodItem?.tracking_id || prodItem?.lead_id || rawIdText;
            const finalOrderId = targetOrder?.order_id || 
              (targetLead?.order_id && !targetLead.order_id.startsWith('TRK-') ? targetLead.order_id : '') || 
              (prodItem?.order_id && !prodItem.order_id.startsWith('TRK-') ? prodItem.order_id : '') || 
              (rawIdText && !rawIdText.startsWith('TRK-') ? rawIdText : '') || 
              prodItem?.order_id || 
              rawIdText;
            const finalCustomerName = targetOrder?.customer_name || 
              (targetOrder as any)?.client_name || 
              targetLead?.customer_name || 
              (targetLead as any)?.client_name || 
              (prodItem?.customer_name && prodItem.customer_name !== 'Client' ? prodItem.customer_name : '') || 
              'Client';

            setNoteModalState({
              isOpen: true,
              leadId: finalLeadId,
              orderId: finalOrderId,
              customerName: finalCustomerName
            });
          }
        }
      }
    };

    window.addEventListener('click', handleCaptureClick, true);

    // Observer to hide Upload Name field and auto-populate value if empty
    const handleCheckUploadName = () => {
      const uploadInputs = document.querySelectorAll<HTMLInputElement>('input[placeholder*="Client_Consent_Proof"]');
      uploadInputs.forEach(input => {
        const parentDiv = (input.closest('div.space-y-1\\.5') || input.parentElement) as HTMLElement | null;
        if (parentDiv && parentDiv.style.display !== 'none') {
          parentDiv.style.display = 'none';
        }
        if (!input.value) {
          input.value = 'client_consent_proof.jpg';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    };

    const interval = setInterval(handleCheckUploadName, 300);
    handleCheckUploadName();

    return () => {
      window.removeEventListener('click', handleCaptureClick, true);
      clearInterval(interval);
    };
  }, [production, orders, leads]);

  return (
    <AddNoteModal
      isOpen={noteModalState.isOpen}
      onClose={() => setNoteModalState(prev => ({ ...prev, isOpen: false }))}
      leadId={noteModalState.leadId}
      orderId={noteModalState.orderId}
      customerName={noteModalState.customerName}
    />
  );
};
