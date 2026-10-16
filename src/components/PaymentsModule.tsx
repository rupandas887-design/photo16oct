import React, { useState, useEffect } from 'react';
import { useRole } from './RoleContext';
import { 
  Landmark, DollarSign, Calendar, FileText, CheckCircle2, AlertCircle, Sparkles, Ban, Trash2
} from 'lucide-react';
import { formatINR, triggerAutoScrollAndFocus } from '../utils';

export const PaymentsModule: React.FC = () => {
  const { currentRole, payments, orders, recordPayment, deletePayment } = useRole();

  // Role permissions gate
  const canEdit = currentRole === 'Sales Team' || currentRole === 'Business Owner';

  // State to manage active record selection
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payDate, setPayDate] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paymentType, setPaymentType] = useState('');

  const handleSelectPayment = (orderId: string) => {
    setSelectedOrderId(orderId);
    setPayAmount('');
    setPayDate('');
    setProofUrl('');
    const existingPayment = payments.find((p) => p.order_id === orderId);
    setTransactionId(existingPayment?.transaction_id || '');
    setPaymentType((existingPayment as any)?.Payment_type || existingPayment?.payment_type || '');
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId || isSaving) return;
    if (!paymentType || paymentType === '') {
      alert('Please select a Payment Type *');
      return;
    }
    if (!payAmount || Number(payAmount) <= 0) {
      alert('Amount must be positive.');
      return;
    }

    try {
      setIsSaving(true);
      await recordPayment(selectedOrderId, Number(payAmount), payDate, proofUrl, transactionId, 'UPI', 'Recorded via ledger', paymentType);
      setSelectedOrderId(null);
      alert('Payment balance recorded successfully. Stage updated in master ledger!');
    } catch (err: any) {
      console.error("Failed to record payment:", err);
      alert("Failed to record payment. Details: " + (err.message || "Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (selectedOrderId) {
      triggerAutoScrollAndFocus('#payment_update_modal', 150);
    }
  }, [selectedOrderId]);

  return (
    <div id="payments_module" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <span className="p-1 px-2.5 bg-rose-500/10 text-rose-450 border border-rose-500/20 text-xs font-mono rounded tracking-widest">BILLINGS</span>
          <span>Accounts Ledger & Billings</span>
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Ledger oversight for downpayments, final payments, receipt URLs, state tracking and pipeline closings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Column Left: Billing index list */}
        <div className="lg:col-span-12 xl:col-span-12 bg-zinc-900/40 backdrop-blur-sm rounded-2xl border border-zinc-850 overflow-hidden shadow-2xl relative">
          <div className="p-4 border-b border-zinc-850 bg-zinc-950/70 flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-[10px] font-black text-zinc-350 uppercase tracking-widest flex items-center gap-1.5 font-mono">
              <Landmark className="w-4 h-4 text-rose-500" />
              <span>Accounts Receivables Ledger Index</span>
            </h3>
            <span className="text-[9px] text-zinc-550 font-mono">OVERSIGHT MODE</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-zinc-950/40 text-zinc-400 font-bold border-b border-zinc-850 tracking-wider uppercase text-[10px] font-mono">
                  <th className="p-3 pl-4">Payment ID</th>
                  <th className="p-3">Order Ref</th>
                  <th className="p-3">Quotation</th>
                  <th className="p-3">Advance</th>
                  <th className="p-3">Final Recv'd</th>
                  <th className="p-3">Balance due</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right pr-4 font-sans-important">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {payments.map((p) => {
                  const linkedOrder = orders.find((o) => o.order_id === p.order_id);
                  const isSelected = selectedOrderId === p.order_id;
                  return (
                    <tr 
                      key={p.payment_id} 
                      className={`hover:bg-zinc-900/35 transition-all text-zinc-300 ${
                        isSelected ? 'bg-rose-500/10' : ''
                      }`}
                    >
                      <td className="p-3 pl-4 font-mono font-bold text-[11px] text-zinc-455">
                        <div>{p.payment_id}</div>
                        <div className="text-[9px] text-zinc-500 font-normal mt-0.5">
                          Txn: {(!p.transaction_id || p.transaction_id.trim() === '' || p.transaction_id === 'null' || p.transaction_id === 'NULL') ? 'N/A' : p.transaction_id}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-rose-400">
                        {p.order_id}
                      </td>
                      <td className="p-3 font-mono text-zinc-200">
                        {formatINR(p.quotation_amount)}
                      </td>
                      <td className="p-3 font-mono text-emerald-400 font-medium">
                        {formatINR(p.advance_received)}
                      </td>
                      <td className="p-3 font-mono text-emerald-400 font-medium">
                        {formatINR(p.final_payment_received)}
                      </td>
                      <td className="p-3 font-mono">
                        <strong className={p.balance_due > 0 ? "text-rose-450 font-bold" : "text-emerald-450 font-bold"}>
                          {formatINR(p.balance_due)}
                        </strong>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase border border-rose-500/10 ${
                          p.payment_status === 'Fully Paid' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        <div className="flex items-center justify-end gap-2">
                          {p.balance_due > 0 && canEdit ? (
                            <button
                              onClick={() => handleSelectPayment(p.order_id)}
                              className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-90 text-rose-400 hover:text-white border border-zinc-850 font-semibold rounded text-[11px] transition-all cursor-pointer"
                            >
                              Collect Balance
                            </button>
                          ) : p.balance_due <= 0 ? (
                            <span className="text-[10px] text-emerald-400 font-semibold font-mono flex items-center justify-end gap-1 pr-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Settled</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-600 italic pr-2 font-mono">Gated</span>
                          )}
                          {canEdit && (
                            <button
                              onClick={async () => {
                                if (confirm(`Are you absolutely sure you want to delete payment record for "${p.payment_id}"?`)) {
                                  await deletePayment(p.payment_id);
                                }
                              }}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/15 hover:border-rose-500/30 rounded-lg transition-all cursor-pointer"
                              title="Delete Payment Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Column Right: Action Form panel */}
        <div className="hidden space-y-6 w-full">
          {selectedOrderId ? (
            (() => {
              const paymentItem = payments.find((p) => p.order_id === selectedOrderId)!;
              return (
                <div className="bg-zinc-900/40 backdrop-blur-sm p-6 rounded-2xl border border-zinc-850 space-y-4 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 text-rose-500/10 font-mono text-2xl font-black tracking-tighter select-none">LEDGER</div>
                  
                  <div className="border-b border-zinc-850 pb-3">
                    <h3 className="text-xs font-black text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                      <Landmark className="w-4 h-4 text-rose-500" />
                      <span>Record Ledger Transfer</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1 font-sans">
                      Final ledger balancing for Contract Reference: <strong className="text-rose-450 font-mono">{selectedOrderId}</strong>
                    </p>
                  </div>

                  <form onSubmit={handlePaySubmit} className="space-y-4 text-xs font-sans">
                    
                    {/* Quotation summary readout */}
                    <div className="bg-zinc-950/80 rounded-xl p-4 border border-zinc-850 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono">
                      <div>
                        <span className="text-zinc-500">Contract Value:</span>
                        <p className="font-bold text-zinc-200 mt-0.5">{formatINR(paymentItem.quotation_amount)}</p>
                      </div>
                      <div>
                        <span className="text-zinc-550">Outstanding Due:</span>
                        <p className="font-bold text-rose-455 mt-0.5">{formatINR(paymentItem.balance_due)}</p>
                      </div>
                    </div>

                    {paymentItem.transaction_id && (
                      <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-850 text-[11px] font-mono">
                        <span className="text-zinc-500 block">Existing Transaction ID:</span>
                        <p className="font-bold text-emerald-400 mt-0.5">{paymentItem.transaction_id}</p>
                      </div>
                    )}

                    {/* Payment Type Selection */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Payment Type *
                      </label>
                      <select
                        required
                        value={paymentType}
                        onChange={(e) => setPaymentType(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-3 px-4 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold"
                      >
                        <option value="">-- Select Payment Type * --</option>
                        <option value="Advance Payment">Advance Payment</option>
                        <option value="Event Date Payment">Event Date Payment</option>
                        <option value="Shoot Time Payment">Shoot Time Payment</option>
                        <option value="Final Payment">Final Payment</option>
                      </select>
                    </div>

                    {/* Commit Input */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Amount to Collect (₹) *
                      </label>
                      <div className="relative">
                        <span className="text-rose-455 absolute left-3.5 top-2.5 font-sans font-bold text-base select-none">₹</span>
                        <input
                          type="number"
                          required
                          max={paymentItem.balance_due}
                          value={payAmount}
                          onChange={(e) => setPayAmount(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-850 rounded-xl pl-9 pr-4 py-3 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    </div>

                    {/* Pay date */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Cleared Settlement Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-3 px-4 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    {/* Transaction ID (Optional) */}
                    {(payAmount !== '' && Number(payAmount) > 0) && (
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                          Transaction ID (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="UPI ID, Bank Ref, IMPS, RTGS, Card Txn etc."
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-855 rounded-xl py-3 px-4 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-505"
                        />
                      </div>
                    )}

                    {/* Proof url link */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Payment Proof Receipt URL
                      </label>
                      <input
                        type="url"
                        placeholder="s3://photocrew-billing-vault/invoice_proof.pdf"
                        value={proofUrl}
                        onChange={(e) => setProofUrl(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-855 rounded-xl py-3 px-4 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-505"
                      />
                    </div>

                    {/* Action commit */}
                    <div className="flex justify-end gap-2 border-t border-zinc-850 pt-4">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(null)}
                        className="px-4 py-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-800 text-zinc-305 font-bold rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-5 py-2 bg-gradient-to-r from-rose-500 to-orange-550 hover:opacity-95 disabled:opacity-50 text-black font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-rose-500/15"
                      >
                        {isSaving ? 'Processing...' : 'Commit Ledger Credit'}
                      </button>
                    </div>

                  </form>
                </div>
              );
            })()
          ) : (
            <div className="bg-zinc-900/20 backdrop-blur-sm p-12 text-center rounded-2xl border border-zinc-850 text-zinc-500 space-y-3 shadow-xl">
              <Landmark className="w-12 h-12 text-zinc-750 mx-auto" />
              <h4 className="text-xs font-black text-zinc-300 uppercase tracking-widest font-mono">Collect outstanding accounts</h4>
              <p className="text-xs max-w-xs mx-auto text-zinc-500 leading-relaxed font-sans">
                Select an unpaid contract record from the RECEIVABLES LEDGER index on the left to allocate final downpayments or clear audit balances in the master billing database.
              </p>
            </div>
          )}

          {/* Secure gate notification */}
          {!canEdit && (
            <div className="bg-rose-550/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-4 shadow-md">
              <Ban className="w-4 h-4 text-rose-450 mt-0.5 flex-shrink-0" />
              <div>
                <h5 className="text-[10px] font-black text-rose-455 uppercase tracking-wide font-mono">Finance edits restricted</h5>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed font-sans">
                  Only the **Sales Team** or the **Business Owner** hold the clearance level required to deposit funds to the ledger, alter quotation amounts, or close billing items. Toggle your sandbox persona as needed.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Popup Modal for Details (Centered & Responsive for Desktop, Tablet, and Mobile) */}
      {selectedOrderId && (
        <div id="payments_details_mobile_modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div id="payment_update_modal" className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl relative flex flex-col">
            <div className="p-4 border-b border-zinc-850 flex items-center justify-between bg-zinc-900/60 sticky top-0 z-10 backdrop-blur-md">
              <h3 className="text-xs font-black text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                <Landmark className="w-4 h-4 text-rose-500" />
                <span>Record Ledger Transfer</span>
              </h3>
              <button 
                onClick={() => setSelectedOrderId(null)}
                className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs rounded-xl transition-all cursor-pointer border border-zinc-800"
              >
                Close
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {(() => {
                const paymentItem = payments.find((p) => p.order_id === selectedOrderId)!;
                if (!paymentItem) return null;
                return (
                  <form onSubmit={handlePaySubmit} className="space-y-4 text-xs font-sans">
                    <p className="text-[11px] text-zinc-400 font-sans">
                      Final ledger balancing for Contract Reference: <strong className="text-rose-455 font-mono">{selectedOrderId}</strong>
                    </p>
                    
                    {/* Quotation summary readout */}
                    <div className="bg-zinc-900/80 rounded-xl p-4 border border-zinc-850 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono">
                      <div>
                        <span className="text-zinc-550">Contract Value:</span>
                        <p className="font-bold text-zinc-200 mt-0.5">{formatINR(paymentItem.quotation_amount)}</p>
                      </div>
                      <div>
                        <span className="text-zinc-555">Outstanding Due:</span>
                        <p className="font-bold text-rose-455 mt-0.5">{formatINR(paymentItem.balance_due)}</p>
                      </div>
                    </div>

                    {paymentItem.transaction_id && (
                      <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-850 text-[11px] font-mono">
                        <span className="text-zinc-500 block">Existing Transaction ID:</span>
                        <p className="font-bold text-emerald-400 mt-0.5">{paymentItem.transaction_id}</p>
                      </div>
                    )}

                    {/* Commit Input */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Amount to Collect (₹) *
                      </label>
                      <div className="relative">
                        <span className="text-rose-455 absolute left-3.5 top-2.5 font-sans font-bold text-base select-none">₹</span>
                        <input
                          type="number"
                          required
                          max={paymentItem.balance_due}
                          value={payAmount}
                          onChange={(e) => setPayAmount(Number(e.target.value))}
                          className="w-full bg-zinc-900 border border-zinc-840 rounded-xl pl-9 pr-4 py-3 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    </div>

                    {/* Pay date */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Cleared Settlement Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-840 rounded-xl py-3 px-4 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    {/* Transaction ID (Optional) */}
                    {(payAmount !== '' && Number(payAmount) > 0) && (
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                          Transaction ID (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="UPI ID, Bank Ref, IMPS, RTGS, Card Txn etc."
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-840 rounded-xl py-3 px-4 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-505"
                        />
                      </div>
                    )}

                    {/* Proof url link */}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5 font-mono">
                        Payment Proof Receipt URL *
                      </label>
                      <input
                        type="url"
                        required
                        placeholder="s3://photocrew-billing-vault/invoice_proof.pdf"
                        value={proofUrl}
                        onChange={(e) => setProofUrl(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-840 rounded-xl py-3 px-4 text-xs text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-rose-505"
                      />
                    </div>

                    {/* Action commit */}
                    <div className="flex justify-end gap-2 border-t border-zinc-850 pt-4">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(null)}
                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-5 py-2 bg-gradient-to-r from-rose-500 to-orange-550 hover:opacity-95 disabled:opacity-50 text-black font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-rose-500/15"
                      >
                        {isSaving ? 'Processing...' : 'Commit Ledger Credit'}
                      </button>
                    </div>

                  </form>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
