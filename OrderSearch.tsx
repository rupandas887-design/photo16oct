import React, { useState } from 'react';
import { useRole } from './RoleContext';
import { 
  Search, ShieldAlert, Key, Landmark, HelpCircle, MapPin, Calendar, Clock, DollarSign, Camera, FileCheck, Trash2
} from 'lucide-react';
import { formatINR, formatIndianPhoneNumber, formatTime12Hour } from '../utils';

export const OrderSearch: React.FC = () => {
  const { leads, orders, operations, production, payments, rawFootage, deleteLead, deleteOrder } = useRole();
  const [searchQuery, setSearchQuery] = useState('');

  // Search logic covering Lead ID, Order ID, Customer Name, Mobile Number
  const performSearch = () => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase().trim();

    return leads.filter((ld) => {
      // Find order linked to this lead
      const ord = orders.find((o) => o.lead_id === ld.lead_id);
      
      const matchLeadId = ld.lead_id.toLowerCase().includes(query);
      const matchOrderId = ord ? ord.order_id.toLowerCase().includes(query) : false;
      const matchCustomer = ld.customer_name.toLowerCase().includes(query);
      const matchMobile = ld.mobile.includes(query);

      return matchLeadId || matchOrderId || matchCustomer || matchMobile;
    });
  };

  const results = performSearch();

  // Helper resolvers for search targets
  const getLinkedOrder = (leadId: string) => orders.find((o) => o.lead_id === leadId);
  const getOpDetails = (orderId?: string) => orderId ? operations.find((op) => op.order_id === orderId) : undefined;
  const getProdDetails = (orderId?: string) => {
    if (!orderId) return undefined;
    // Find raw footage tracking id linked to this order
    const rf = rawFootage.find((f) => f.order_id === orderId);
    if (!rf) return undefined;
    return production.find((p) => p.tracking_id === rf.tracking_id);
  };
  
  const srcRawFootageByOrder = (orderId: string) => {
    return rawFootage.find((f) => f.order_id === orderId);
  };

  const getPaymentDetails = (orderId?: string) => orderId ? payments.find((p) => p.order_id === orderId) : undefined;

  return (
    <div id="order_search_module" className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>🔍</span> Multi-Field Global Search
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Page 11-12 compliance lookup. Retrieve any contract instantly using Lead ID, Order Contract ID, Customer Name or Phone.
        </p>
      </div>

      {/* Bar */}
      <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-3">
        <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-450">
          Search Directory Database
        </label>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by Lead ID (e.g. LD001), Order ID (e.g. OR001), Sophia Loren, or +1 (555) 123-4567..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-750 rounded-xl pl-11 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
          />
        </div>
      </div>

      {/* Display Results */}
      <div className="space-y-4">
        {results.length > 0 ? (
          results.map((lead) => {
            const order = getLinkedOrder(lead.lead_id);
            const op = getOpDetails(order?.order_id);
            const prod = getProdDetails(order?.order_id);
            const pay = getPaymentDetails(order?.order_id);

            return (
              <div 
                key={lead.lead_id} 
                className="bg-slate-850 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm"
              >
                {/* Search summary banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-850 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-101">{lead.customer_name}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] bg-slate-900 px-2 py-0.5 border border-slate-800 rounded font-mono text-slate-400">
                        Lead: {lead.lead_id}
                      </span>
                      {order && (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-bold">
                          Order Check: {order.order_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1.5">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-mono">Current Stage Tracker</span>
                      <strong className="text-xs bg-indigo-650 text-white rounded px-2.5 py-1 inline-block mt-1 uppercase font-bold tracking-tight">
                        {lead.status}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {order && (
                        <button
                          onClick={async () => {
                            if (confirm(`Are you absolutely sure you want to delete order "${order.order_id}"? All associated payments, raw footage, production assignments, and operational files will be permanently purged.`)) {
                              await deleteOrder(order.order_id);
                            }
                          }}
                          className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/15 hover:border-rose-500/30 rounded-lg text-[10px] font-mono uppercase transition-all cursor-pointer flex items-center gap-1"
                          title="Delete Order & Cascades"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>Delete Order</span>
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (confirm(`Are you absolutely sure you want to delete lead "${lead.customer_name}" (${lead.lead_id})? All linked orders, payments, history logs, quotations, and staff rosters will be completely deleted.`)) {
                            await deleteLead(lead.lead_id);
                          }
                        }}
                        className="px-2 py-1 bg-rose-650 hover:bg-rose-700 text-white rounded-lg text-[10px] font-mono uppercase transition-all cursor-pointer flex items-center gap-1"
                        title="Delete Lead & Linked Records"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                        <span>Delete Lead</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub row detail cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Card 1: Lead CRM General */}
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider block uppercase">
                      📞 Client CRM Info
                    </span>
                    <p className="text-slate-350 break-words">Mobile: <strong className="text-slate-200">{formatIndianPhoneNumber(lead.mobile)}</strong></p>
                    <p className="text-slate-350 break-words">Email: <span className="text-slate-200">{lead.email}</span></p>
                    <p className="text-slate-350">Event Location: <span className="text-slate-200">{lead.event_location}</span></p>
                    <p className="text-slate-350">Date & Time: <span className="text-slate-200">{lead.event_date} @ {formatTime12Hour(lead.event_time)}</span></p>
                  </div>

                  {/* Card 2: Assigned Operations Team (CREW) */}
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider block uppercase flex items-center justify-between">
                      <span>⚡ Assigned Crews</span>
                      {op && <span className="text-[9px] text-sky-400 font-mono border border-sky-500/20 px-1 rounded">Prepped</span>}
                    </span>
                    {op ? (
                      <div className="space-y-1 text-slate-350 text-[11px]">
                        <p>Photo: <strong className="text-slate-200">{op.photographer_assigned}</strong></p>
                        <p>Video: <strong className="text-slate-200">{op.videographer_assigned}</strong></p>
                        <p>Drone: <span className="text-slate-250">{op.drone_operator_assigned}</span></p>
                        <p>Assist: <span className="text-slate-250">{op.assistant_assigned}</span></p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic mt-1 font-mono text-[10px]">Crews not yet deployed to operations queue.</p>
                    )}
                  </div>

                  {/* Card 3: Post-Production (Delivery Status) */}
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-505 font-mono tracking-wider block uppercase">
                      🎬 Delivery Status
                    </span>
                    {prod ? (
                      <div className="space-y-1 text-slate-350 text-[11px]">
                        <p>Editor: <strong className="text-slate-200">{prod.editor_assigned}</strong></p>
                        <p>Status: <span className="font-semibold text-amber-400">{prod.editing_status}</span></p>
                        <p className="break-words">S3 Paths: <span className="text-[9px] font-mono select-all text-slate-400">{prod.raw_footage_location}</span></p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic mt-1 font-mono text-[10px]">Unassigned from editor timeline queue.</p>
                    )}
                  </div>

                  {/* Card 4: Payments Ledger Status */}
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-505 font-mono tracking-wider block uppercase">
                      💎 Payment Status
                    </span>
                    {pay ? (
                      <div className="space-y-1 text-slate-350 text-[11px]">
                        <p>Price: <strong className="text-slate-200">{formatINR(pay.quotation_amount)}</strong></p>
                        <p>Advance: <span className="text-emerald-400 font-mono">{formatINR(pay.advance_received)}</span></p>
                        <p>Final Recv: <span className="text-emerald-400 font-mono">{formatINR(pay.final_payment_received)}</span></p>
                        <p className="border-t border-slate-800/80 pt-1 flex items-center justify-between">
                          <span>Bal Due:</span>
                          <strong className={pay.balance_due > 0 ? "text-rose-400 font-mono font-bold" : "text-emerald-400 font-mono font-bold"}>
                            {formatINR(pay.balance_due)}
                          </strong>
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic mt-1 font-mono text-[10px]">Client ledger balance not yet finalized.</p>
                    )}
                  </div>
                </div>

              </div>
            );
          })
        ) : (
          searchQuery.trim() !== '' && (
            <div className="p-12 text-center bg-slate-850/60 rounded-xl border border-dashed border-slate-800 text-slate-550 flex flex-col items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-rose-500 mb-2" />
              <h4 className="text-sm font-semibold text-slate-300">No matching search query found</h4>
              <p className="text-xs max-w-sm mt-1">
                We couldn't locate any records matching "{searchQuery}". Verify the Spelling or contract ID numbers. (e.g. Try typing: **Sophia** or **OR001**).
              </p>
            </div>
          )
        )}

        {searchQuery.trim() === '' && (
          <div className="p-12 text-center bg-slate-850/30 rounded-xl border border-slate-800 text-slate-500">
            <Search className="w-10 h-10 text-slate-750 mx-auto mb-2" />
            <p className="text-xs max-w-xs mx-auto">
              Please insert a search query to search across clients, mobile numbers, leads and order directories.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};
