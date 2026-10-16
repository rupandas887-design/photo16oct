import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw
} from 'lucide-react';
import { Lead, CurrentStage, LeadPackage, EVENT_TYPES, PACKAGE_CATEGORIES, ACTIVE_STAGE_GROUPS, LeadEvent } from '../../types';
import { StatusText } from '../ui/StatusText';
import { EventDropdownCell } from '../EventDropdownCell';
import { UnifiedEventDropdownCell } from '../UnifiedEventDropdownCell';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { CameraLensStatsCard, CameraLensTheme } from '../CameraLensStatsCard';
import { ListSortFilter, SortOrder } from '../ui/ListSortFilter';
import { formatINR, formatIndianPhoneNumber, validateIndianMobile, formatTime12Hour, getCustomers, triggerAutoScrollAndFocus, normalizeCategory, parseTeamMembers, formatQtyItem, formatQtyArray, formatQtyList, formatDateDDMMYY } from '../../utils';
import { SalesCalendar } from '../SalesCalendar';
import { CustomPackageMaster } from '../CustomPackageMaster';
import { AddressAutocomplete } from '../AddressAutocomplete';
import { jsPDF } from 'jspdf';
import { SHOOT_TYPES, LocalEditableInput, parseQtyAndText, combineQtyAndText, formatListToStructuredObjects, buildStep3EventPayloads, parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord, CompactQtyItemRowProps, CompactQtyItemRow, validateAndFormatTime, getLogoBase64FromUrl, generateQuotationPdfFileName, generateQuotationPDF, highlightText, LEAD_SOURCES, SalesModuleProps, sortEventsAscending, getStep3FinalQuotationAmount, getSyncSavedQuotationAmount, resolveSavedQuotationAmount } from '../SalesUtils';
import { AddNoteModal } from '../AddNoteModal';
import { TimePicker12Hour } from '../TimePicker12Hour';


export interface SalesBookingConfirmationModalProps {
  [key: string]: any;
}

export const SalesBookingConfirmationModal: React.FC<SalesBookingConfirmationModalProps> = (props) => {
  const {
    showConfirmModal,
    selectedLead,
    crmEvents,
    confirmBookingModalRef,
    confirmForm,
    setConfirmForm,
    packages,
    isCustomerInfoExpanded,
    setIsCustomerInfoExpanded,
    eventsReporting,
    setEventsReporting,
    formatDDMMYYYY,
    convertTo12Hour,
    isConfirmingBooking,
    handleConfirmOrder,
    handleConfirmOrderSubmit = props.handleConfirmOrder,
    setShowConfirmModal,
    orders,
    wizardLeadData,
    isSaving,
    quotations,
    leads,
    leadPackages = props.leadPackages,
    dynamicFinalAmt = props.dynamicFinalAmt
  } = props;

  // Step 3 Final Quotation Amount is the single source of truth for the Booking Confirmation form
  useEffect(() => {
    if (showConfirmModal && selectedLead) {
      const leadId = selectedLead.lead_id;
      const orderId = selectedLead.order_id;
      
      const step3Amt = getStep3FinalQuotationAmount(selectedLead, {
        dynamicFinalAmt,
        wizardLeadData,
        quotations,
        leads,
        orders,
        leadPackages,
        confirmFormQuotationAmount: confirmForm.quotation_amount
      });

      if (step3Amt > 0) {
        if (!confirmForm.quotation_amount || Number(confirmForm.quotation_amount) !== step3Amt) {
          setConfirmForm((prev: any) => ({ ...prev, quotation_amount: step3Amt }));
        }
      }

      // If asynchronous data loads or upon page refresh/reopening, resolve latest saved Step 3 Final Quotation Amount
      resolveSavedQuotationAmount(leadId, orderId, quotations, leads, orders, leadPackages).then((resolvedAmt) => {
        if (resolvedAmt !== null && resolvedAmt > 0) {
          setConfirmForm((prev: any) => {
            const liveStep3 = getStep3FinalQuotationAmount(selectedLead, {
              dynamicFinalAmt,
              wizardLeadData,
              quotations,
              leads,
              orders,
              leadPackages,
              confirmFormQuotationAmount: prev.quotation_amount
            });
            const finalTarget = liveStep3 > 0 ? liveStep3 : resolvedAmt;
            if (!prev.quotation_amount || Number(prev.quotation_amount) !== finalTarget) {
              return { ...prev, quotation_amount: finalTarget };
            }
            return prev;
          });
        }
      });
    }
  }, [showConfirmModal, selectedLead?.lead_id, dynamicFinalAmt, wizardLeadData?.final_amount]);

  if (!showConfirmModal || !selectedLead) return null;

  const rawModalEvents = (crmEvents && Array.isArray(crmEvents) && crmEvents.length > 0 && selectedLead?.lead_id)
    ? crmEvents
    : (selectedLead?.events && Array.isArray(selectedLead.events) && selectedLead.events.length > 0 ? selectedLead.events : (crmEvents || []));
  const sortedModalEvents = sortEventsAscending(rawModalEvents);

  const modalContent = showConfirmModal && selectedLead ? (
    <div 
      className="fixed inset-0 bg-black/85 z-[99999] flex items-center justify-center p-2.5 sm:p-4 md:p-6 backdrop-blur-md overflow-hidden transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm_booking_modal_title"
    >
      <div 
        ref={confirmBookingModalRef}
        id="confirm_booking_modal" 
        className="bg-slate-850 border border-slate-750 rounded-2xl overflow-hidden max-w-lg sm:max-w-xl md:max-w-2xl w-full shadow-2xl flex flex-col h-[calc(100dvh-1.25rem)] max-h-[calc(100vh-1.25rem)] sm:h-auto sm:max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-3rem)] sm:max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-3rem)] animate-in fade-in zoom-in-95 duration-150 relative"
      >
        {/* Header - Fixed at Top */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 sm:px-5 py-3 sm:py-3.5 shrink-0 bg-slate-850">
          <h4 id="confirm_booking_modal_title" className="font-bold text-slate-100 text-sm sm:text-base flex items-center gap-2 font-sans min-w-0">
            <span className="text-base sm:text-lg shrink-0">💍</span>
            <span className="truncate">Booking Confirmation & Contract Form</span>
          </h4>
          <button 
            type="button"
            onClick={() => setShowConfirmModal(false)}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
            title="Close"
            aria-label="Close Booking Confirmation Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

            <form onSubmit={handleConfirmOrderSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* ONE SINGLE SCROLLABLE CONTAINER FOR THE ENTIRE POPUP CONTENT */}
              <div className="overflow-y-auto overflow-x-hidden px-3.5 sm:px-5 md:px-6 pt-4 pb-6 sm:pb-5 custom-scrollbar flex-1 min-h-0 space-y-4 text-xs overscroll-contain">
                
                {/* Product package name - Read-Only */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Product Package Name *
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={confirmForm.package_name || packages?.find((p) => String(p.package_id) === String(selectedLead.Select_Package_Option))?.package_name || selectedLead.Select_Package_Option || 'Custom Selected Package'}
                    className="w-full h-9 bg-slate-900/80 border border-slate-750 rounded-lg px-3 text-slate-200 text-xs font-medium focus:outline-none opacity-85 cursor-not-allowed select-none shadow-inner"
                  />
                </div>

                {/* Event Date & Reporting Details Section */}
                <div>
                  <label className="block text-xs font-semibold text-amber-400 mb-1.5 flex items-center justify-between flex-wrap gap-1">
                    <span>📅 Events & Reporting Details *</span>
                    <span className="text-[10px] text-slate-400 font-normal">Set reporting time for crew</span>
                  </label>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:p-3.5 space-y-3">
                    {sortedModalEvents && sortedModalEvents.length > 0 ? (
                      sortedModalEvents.map((ev, i) => {
                        const key = ev.id || `ev_${i}`;
                        const repData = eventsReporting[key] || {
                          reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
                          reporting_time: ev.reporting_time || selectedLead.reporting_time || ''
                        };

                        return (
                          <div key={key} className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                              <span className="text-xs font-bold text-amber-400 font-sans tracking-wide">
                                {sortedModalEvents.length > 1 ? `EVENT ${i + 1}` : 'EVENT DETAILS'}
                              </span>
                              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 truncate max-w-[150px]">
                                {ev.event_shoot_type || selectedLead.shoot_type || 'Shoot'}
                              </span>
                            </div>

                            {/* Event Name info (Event Date & Event Time removed from UI) */}
                            <div className="bg-slate-900/60 p-2.5 rounded-md border border-slate-800/60 text-[11px]">
                              <div className="min-w-0">
                                <span className="text-slate-400 block text-[10px] uppercase font-mono">Event Name</span>
                                <span className="text-slate-200 font-semibold break-words">{ev.event_name || 'Event'}</span>
                              </div>
                            </div>

                            {/* Reporting Date & Reporting Time */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                              <div>
                                <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                                  Reporting Date *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={repData.reporting_date || ''}
                                  onChange={(e) => {
                                    setEventsReporting(prev => ({
                                      ...prev,
                                      [key]: {
                                        ...(prev[key] || { reporting_time: '' }),
                                        reporting_date: e.target.value
                                      }
                                    }));
                                  }}
                                  className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                                  Reporting Time *
                                </label>
                                <TimePicker12Hour
                                  required
                                  value={repData.reporting_time || ''}
                                  onChange={(val24) => {
                                    setEventsReporting(prev => ({
                                      ...prev,
                                      [key]: {
                                        ...(prev[key] || { reporting_date: '' }),
                                        reporting_time: val24
                                      }
                                    }));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                          <span className="text-xs font-bold text-amber-400 font-sans tracking-wide">
                            EVENT DETAILS
                          </span>
                          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 truncate max-w-[150px]">
                            {selectedLead.shoot_type || 'Shoot'}
                          </span>
                        </div>

                        {/* Single Event Info (Event Date & Event Time removed from UI) */}
                        <div className="bg-slate-900/60 p-2.5 rounded-md border border-slate-800/60 text-[11px]">
                          <div className="min-w-0">
                            <span className="text-slate-400 block text-[10px] uppercase font-mono">Event Name</span>
                            <span className="text-slate-200 font-semibold break-words">{selectedLead.event_type === 'Other' ? (selectedLead.custom_event_name || selectedLead.custom_event_type || 'Other') : (selectedLead.event_type || 'General Event')}</span>
                          </div>
                        </div>

                        {/* Reporting Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                          <div>
                            <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                              Reporting Date *
                            </label>
                            <input
                              type="date"
                              required
                              value={eventsReporting['default']?.reporting_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || ''}
                              onChange={(e) => {
                                setEventsReporting(prev => ({
                                  ...prev,
                                  default: {
                                    ...(prev['default'] || { reporting_time: '' }),
                                    reporting_date: e.target.value
                                  }
                                }));
                              }}
                              className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono font-bold uppercase text-slate-400 mb-1">
                              Reporting Time *
                            </label>
                            <TimePicker12Hour
                              required
                              value={eventsReporting['default']?.reporting_time || selectedLead.reporting_time || ''}
                              onChange={(val24) => {
                                setEventsReporting(prev => ({
                                  ...prev,
                                  default: {
                                    ...(prev['default'] || { reporting_date: '' }),
                                    reporting_time: val24
                                  }
                                }));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <input type="hidden" value={confirmForm.event_date || ''} />
                </div>

                {/* Package cost and advance */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Final Package Amount (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      readOnly
                      disabled
                      value={(() => {
                        const step3ResolvedAmt = getStep3FinalQuotationAmount(selectedLead, {
                          dynamicFinalAmt,
                          wizardLeadData,
                          quotations,
                          leads,
                          orders,
                          leadPackages,
                          confirmFormQuotationAmount: confirmForm.quotation_amount
                        });
                        return step3ResolvedAmt > 0 ? step3ResolvedAmt : (confirmForm.quotation_amount || '');
                      })()}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none font-mono opacity-80 cursor-not-allowed select-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Advance Collected (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={confirmForm.advance_received !== undefined && confirmForm.advance_received !== null ? confirmForm.advance_received : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setConfirmForm({ ...confirmForm, advance_received: '' as any });
                        } else {
                          const num = Number(val);
                          setConfirmForm({ ...confirmForm, advance_received: isNaN(num) ? 0 : num });
                        }
                      }}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Payment Mode & Payment Tracking ID in a responsive 2-column layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Payment Mode
                    </label>
                    <select
                      value={confirmForm.payment_mode}
                      onChange={(e) => setConfirmForm({ ...confirmForm, payment_mode: e.target.value })}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="UPI">UPI (GPay/PhonePe)</option>
                      <option value="Cash">Cash Handover</option>
                      <option value="Bank Transfer">Bank NFT/RTGS/IMPS</option>
                      <option value="Card">Credit/Debit Card</option>
                      <option value="Cheque">Cheque Deposit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Payment Tracking / Ref Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. TXN12345678"
                      value={confirmForm.transaction_id || ''}
                      onChange={(e) => setConfirmForm({ ...confirmForm, transaction_id: e.target.value })}
                      className="w-full h-9 bg-slate-900 border border-slate-750 rounded-lg px-3 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Balance due readout */}
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">Remaining Balance Due:</span>
                  <strong className="text-emerald-400 font-mono font-bold text-sm sm:text-base">
                    {formatINR(Math.max(0, (confirmForm.quotation_amount || 0) - ((confirmForm.advance_received !== '' && !isNaN(Number(confirmForm.advance_received))) ? Number(confirmForm.advance_received) : 0)))}
                  </strong>
                </div>
              </div>

              {/* Bottom Action Buttons - Fixed & Accessible at Modal Footer */}
              <div className="shrink-0 flex items-center justify-end gap-2.5 border-t border-slate-800 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 bg-slate-850/95 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="w-auto px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs font-medium transition-colors text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn_confirm_submit"
                  disabled={isSaving}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/20 text-xs transition-all text-center"
                >
                  <span>{isSaving ? 'Processing...' : 'Approve & Book Contract'}</span>
                  {!isSaving && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </form>
          </div>
        </div>
  ) : null;

  return typeof document !== 'undefined' && modalContent
    ? createPortal(modalContent, document.body)
    : modalContent;
};
