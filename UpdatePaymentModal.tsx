import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard } from 'lucide-react';
import { motion } from 'motion/react';
import { useRole } from '../RoleContext';

export interface UpdatePaymentModalRecord {
  orderId: string;
  lead?: any;
  finalPackageAmount: number;
  totalPaidAmount?: number;
  remainingAmount: number;
  payment?: any;
}

export interface UpdatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: UpdatePaymentModalRecord | null;
  onSuccess?: () => void;
}

export const UpdatePaymentModal: React.FC<UpdatePaymentModalProps> = ({
  isOpen,
  onClose,
  record: paymentModalRecord,
  onSuccess
}) => {
  const { orders, payments, leads, paymentHistory, recordPayment, refreshData } = useRole();

  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [transactionIdInput, setTransactionIdInput] = useState('');
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [paymentType, setPaymentType] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [modalSuccessMsg, setModalSuccessMsg] = useState('');
  const [modalErrorMsg, setModalErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Track initialization to prevent background polling or re-renders from clearing inputs
  const initializedOrderRef = React.useRef<string | null>(null);

  // Format currency in INR style
  const formatPercentageOrINR = (amount: number, isPercentage = false) => {
    if (isPercentage) return `${amount.toFixed(1)}%`;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  useEffect(() => {
    if (!isOpen) {
      initializedOrderRef.current = null;
      return;
    }

    const currentOrderId = paymentModalRecord?.orderId;
    if (isOpen && paymentModalRecord && initializedOrderRef.current !== currentOrderId) {
      initializedOrderRef.current = currentOrderId || null;
      setPaymentAmount('');
      setTransactionIdInput('');
      setPaymentMode('UPI');
      const linkedPay = payments.find(p => p.order_id === paymentModalRecord.orderId || (paymentModalRecord.payment && p.payment_id === paymentModalRecord.payment.payment_id));
      const existingType = (linkedPay as any)?.Payment_type || linkedPay?.payment_type || (paymentModalRecord.payment as any)?.Payment_type || paymentModalRecord.payment?.payment_type || '';
      setPaymentType(existingType);
      setPaymentNotes('');
      setModalSuccessMsg('');
      setModalErrorMsg('');
    }
  }, [isOpen, paymentModalRecord?.orderId]);

  // Dynamically retrieve the real-time record to keep modal updated and synchronized
  const currentRecord = useMemo(() => {
    if (!paymentModalRecord) return null;
    const targetOrderId = paymentModalRecord.orderId;
    const targetLeadId = paymentModalRecord.lead?.lead_id;

    const order = orders.find(o => o.order_id === targetOrderId || (targetLeadId && o.lead_id === targetLeadId));
    const resolvedOrderId = order?.order_id || targetOrderId;
    const payment = order ? payments.find(p => p.order_id === order.order_id) : payments.find(p => (resolvedOrderId && p.order_id === resolvedOrderId) || (targetLeadId && p.lead_id === targetLeadId));
    const lead = leads.find(l => targetLeadId && l.lead_id === targetLeadId) || paymentModalRecord.lead;
    
    const finalPackageAmount = Number(lead?.Final_Quotation_Amount) || 
      Number((lead as any)?.final_quotation_amount) || 
      (paymentModalRecord.finalPackageAmount != null ? paymentModalRecord.finalPackageAmount : 0) || 
      (order ? Number(order.quotation_amount || order.final_amount) : 0) || 
      Number(lead?.budget) || 0;

    const advanceReceived = order ? (Number(order.advance_received) || 0) : (Number(lead?.advance_collected) || 0);

    const orderHistories = (paymentHistory || []).filter((h: any) => {
      if (!h.order_id) return false;
      if (resolvedOrderId && h.order_id === resolvedOrderId) return true;
      if (targetOrderId && h.order_id === targetOrderId) return true;
      if (order?.order_id && h.order_id === order.order_id) return true;
      if (targetLeadId && (h.order_id === targetLeadId || h.order_id === `ORD-${targetLeadId}`)) return true;
      return false;
    });

    const approvedHistories = orderHistories.filter((h: any) => h.approval_status === 'Approved');
    const pendingApprovalHistories = orderHistories.filter((h: any) => h.approval_status === 'Waiting for Approval');

    let approvedAmount = approvedHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
    let pendingApprovalAmount = pendingApprovalHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);

    if (orderHistories.length === 0) {
      if (payment?.payment_status === 'Waiting for Approval') {
        pendingApprovalAmount = (Number(payment.advance_received) || 0) + (Number(payment.final_payment_received) || 0) + (Number(payment.additional_received) || 0) || advanceReceived;
      } else {
        approvedAmount = payment 
          ? ((Number(payment.advance_received) || 0) + (Number(payment.final_payment_received) || 0) + (Number(payment.additional_received) || 0)) 
          : advanceReceived;
      }
    }

    const totalPaidAmount = approvedAmount + pendingApprovalAmount;
    const remainingAmount = Math.max(0, finalPackageAmount - totalPaidAmount);
    
    return {
      finalPackageAmount,
      totalPaidAmount,
      remainingAmount,
      approvedAmount,
      pendingApprovalAmount
    };
  }, [paymentModalRecord, orders, payments, leads, paymentHistory]);

  const handleSavePayment = async () => {
    if (isSaving || !paymentModalRecord) return;
    const cleanAmt = String(paymentAmount).trim();
    const amt = Number(cleanAmt);
    setModalSuccessMsg('');
    setModalErrorMsg('');

    if (!paymentType || paymentType.trim() === '') {
      setModalErrorMsg('❌ Please select a Payment Type.');
      return;
    }

    if (!cleanAmt || isNaN(amt) || amt <= 0) {
      setModalErrorMsg('❌ Please enter a valid payment amount.');
      return;
    }

    const maxAllowed = currentRecord ? currentRecord.remainingAmount : paymentModalRecord.remainingAmount;
    if (amt > maxAllowed) {
      setModalErrorMsg(`❌ Payment cannot exceed the pending amount of ₹${maxAllowed.toLocaleString('en-IN')}`);
      return;
    }

    try {
      setIsSaving(true);
      await recordPayment(
        paymentModalRecord.orderId, 
        amt, 
        new Date().toISOString().split('T')[0], 
        undefined, 
        transactionIdInput,
        paymentMode,
        paymentNotes,
        paymentType
      );
      
      // Refresh global state so leads, orders, payments, and paymentHistory immediately reflect updates
      if (refreshData) {
        await refreshData();
      }

      // Show verified success message inside popup
      setModalSuccessMsg('✅ Payment successfully saved.');
      
      // Reset input fields
      setPaymentAmount('');
      setTransactionIdInput('');
      setPaymentMode('UPI');
      setPaymentNotes('');

      if (onSuccess) {
        onSuccess();
      }
      
      // Auto hide the success message after 2.5 seconds
      setTimeout(() => {
        setModalSuccessMsg('');
      }, 2500);
    } catch (err: any) {
      console.error(err);
      setModalErrorMsg('❌ ' + (err?.message || 'Payment update failed. Please retry.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !paymentModalRecord) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 md:p-6 overflow-y-auto"
      onClick={() => {
        onClose();
        setModalSuccessMsg('');
        setModalErrorMsg('');
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md my-auto bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-zinc-850 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" />
              Update Payment
            </h3>
            <p className="text-[10px] text-zinc-400 mt-1 uppercase font-mono tracking-widest">
              Order: {paymentModalRecord.orderId}
            </p>
          </div>
          <button 
            type="button"
            onClick={() => {
              onClose();
              setModalSuccessMsg('');
              setModalErrorMsg('');
            }}
            className="p-1 px-2 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white uppercase font-mono text-[10px] cursor-pointer"
          >
            Close
          </button>
        </div>
        
        {/* Modal level success and error messages */}
        {modalSuccessMsg && (
          <div className="bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-400 text-xs px-4 py-2.5 font-bold text-center shrink-0">
            {modalSuccessMsg}
          </div>
        )}
        {modalErrorMsg && (
          <div className="bg-rose-950/40 border-b border-rose-500/30 text-rose-400 text-xs px-4 py-2.5 font-bold text-center shrink-0">
            {modalErrorMsg}
          </div>
        )}

        <div id="update_payment_modal_content" className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
          <div className="space-y-2">
            <div className="p-3 bg-zinc-900 rounded-lg flex justify-between items-center border border-zinc-850">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Final Quotation Amount</span>
              <span className="text-sm font-black text-white font-mono">
                {formatPercentageOrINR(currentRecord ? currentRecord.finalPackageAmount : paymentModalRecord.finalPackageAmount)}
              </span>
            </div>
            <div className="p-3 bg-zinc-900 rounded-lg flex justify-between items-center border border-zinc-850">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Total Payment Received</span>
              <span className="text-sm font-black text-emerald-450 font-mono">
                {formatPercentageOrINR(currentRecord ? currentRecord.totalPaidAmount : (paymentModalRecord.finalPackageAmount - paymentModalRecord.remainingAmount))}
              </span>
            </div>
            <div className="p-3 bg-zinc-900 rounded-lg flex justify-between items-center border border-zinc-850">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Total Pending Amount</span>
              <span className={`text-sm font-black font-mono ${currentRecord && currentRecord.remainingAmount === 0 ? 'text-emerald-400' : 'text-rose-450'}`}>
                {formatPercentageOrINR(currentRecord ? currentRecord.remainingAmount : paymentModalRecord.remainingAmount)}
              </span>
            </div>
          </div>
          
          {currentRecord && currentRecord.remainingAmount === 0 ? (
            <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-center text-emerald-400 text-xs font-bold">
              🎉 This order is Fully Paid. No outstanding dues remain.
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>Payment Type</span>
                  <span className="text-rose-500 font-black">*</span>
                </label>
                <select
                  value={paymentType}
                  onChange={(e) => {
                    setPaymentType(e.target.value);
                    if (modalErrorMsg && modalErrorMsg.includes('Payment Type')) {
                      setModalErrorMsg('');
                    }
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                  required
                >
                  <option value="">-- Select Payment Type * --</option>
                  <option value="Advance Payment">Advance Payment</option>
                  <option value="Event Date Payment">Event Date Payment</option>
                  <option value="Shoot Time Payment">Shoot Time Payment</option>
                  <option value="Final Payment">Final Payment</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Payment Received</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={paymentAmount}
                  onChange={(e) => {
                    const rawVal = e.target.value;
                    if (rawVal === '' || /^\d*\.?\d*$/.test(rawVal)) {
                      setPaymentAmount(rawVal);
                      if (modalErrorMsg) {
                        setModalErrorMsg('');
                      }
                    }
                  }}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                  placeholder="0"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Transaction ID</label>
                <input
                  type="text"
                  value={transactionIdInput}
                  onChange={(e) => setTransactionIdInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. TXN1002345"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                >
                  <option value="UPI">UPI / Google Pay / PhonePe</option>
                  <option value="Bank Transfer">Bank NEFT/IMPS/RTGS</option>
                  <option value="Cash">Cash payment</option>
                  <option value="Card">Credit/Debit Card</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Payment Notes</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Part payment for reception event"
                />
              </div>
            </>
          )}
        </div>
        
        <div className="p-4 border-t border-zinc-850 bg-zinc-900/50 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              setModalSuccessMsg('');
              setModalErrorMsg('');
            }}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-750 transition cursor-pointer"
          >
            Close Panel
          </button>
          <button
            type="button"
            onClick={handleSavePayment}
            disabled={isSaving || (currentRecord && currentRecord.remainingAmount === 0) || !paymentAmount.trim() || isNaN(Number(paymentAmount)) || Number(paymentAmount) <= 0 || !paymentType}
            className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition uppercase tracking-wider cursor-pointer"
          >
            {isSaving ? 'Saving...' : 'Save Payment'}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};
