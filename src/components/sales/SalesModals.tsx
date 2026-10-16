import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw, AlertCircle, MessageSquare
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
import { SHOOT_TYPES, LocalEditableInput, parseQtyAndText, combineQtyAndText, formatListToStructuredObjects, buildStep3EventPayloads, parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord, CompactQtyItemRowProps, CompactQtyItemRow, validateAndFormatTime, getLogoBase64FromUrl, generateQuotationPdfFileName, generateQuotationPDF, highlightText, LEAD_SOURCES, SalesModuleProps } from '../SalesUtils';
import { AddNoteModal } from '../AddNoteModal';
import { TimePicker12Hour } from '../TimePicker12Hour';

export interface SalesModalsProps {
  [key: string]: any;
}

export const SalesModals: React.FC<SalesModalsProps> = (props) => {
  const {
    noteModalOpen,
    setNoteModalOpen,
    noteModalLeadId,
    noteModalOrderId,
    noteModalCustomerName,
    showFinalReportingModal,
    setShowFinalReportingModal,
    finalReportingEvent,
    finalReportingDate,
    setFinalReportingDate,
    finalReportingEndDate,
    setFinalReportingEndDate,
    finalReportingTime,
    setFinalReportingTime,
    handleSaveFinalReportingDetails,
    showStep3Popup,
    setShowStep3Popup,
    step3FollowUpDate,
    setStep3FollowUpDate,
    step3FollowUpTime,
    setStep3FollowUpTime,
    step3FollowUpNotes,
    setStep3FollowUpNotes,
    handleSaveStep3FollowUpPopup,
    errorDetails,
    setErrorDetails,
    showLostModal,
    setShowLostModal,
    selectedLead,
    lostReason,
    setLostReason,
    otherLostReason,
    setOtherLostReason,
    lostNotes,
    setLostNotes,
    handleSaveLostLead,
    isSaving,
    showUnlockRequestModal,
    setShowUnlockRequestModal,
    selectedUnlockLead,
    unlockRequestReason,
    setUnlockRequestReason,
    unlockRequestCustomReason,
    setUnlockRequestCustomReason,
    handleRequestUnlockQuotation,
    showCancelConfirmPopup,
    setShowCancelConfirmPopup,
    handleConfirmCancelCrm,
    unlockingRecordId,
    setUnlockingRecordId,
    unlockReason,
    setUnlockReason,
    unlockCustomReason,
    setUnlockCustomReason,
    handleUnlockRecord,
    viewingPkgDetails,
    setViewingPkgDetails,
    deletingPackageId,
    setDeletingPackageId,
    isDeletingPackage,
    deletePackageError,
    handleDeletePackageConfirm,
    isComparingPkgs,
    setIsComparingPkgs,
    packages,
    formatDDMMYYYY,
    convertTo12Hour,
    setSelectedLead,
    handleFinalReportingSubmit,
    finalReportingForm,
    setFinalReportingForm,
    activeTab,
    handleSaveStep3FollowUp,
    isCrmLocked,
    handleSubmitUnlockRequest,
    handleCancelLead,
    canEdit,
    setEditingPackage,
    setPkgForm,
    setPkgTeamMembers,
    setPkgDeliverablesList,
    setIsAddFormOpen,
    leads,
    leadPackages,
    quotations,
    orders,
    setDeletePackageError,
    setIsDeletingPackage,
    deletePackage,
    setPackageSuccessMsg,
    selectedPkgIds,
    subtotal
  } = props;

  return (
    <>
      <AddNoteModal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        leadId={noteModalLeadId}
        orderId={noteModalOrderId}
        customerName={noteModalCustomerName}
      />

      {showFinalReportingModal && selectedLead && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-2.5 sm:p-4 md:p-6 backdrop-blur-md overflow-y-auto">
          <div id="final_reporting_modal" className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl space-y-0 my-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900/90 shrink-0">
              <h4 className="font-bold text-slate-100 text-sm sm:text-base flex items-center gap-2.5 font-sans leading-none m-0">
                <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-sm">⏰</span>
                <span>Final Reporting Details</span>
              </h4>
              <button 
                type="button"
                onClick={() => {
                  setShowFinalReportingModal(false);
                  setSelectedLead(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Form Body */}
            <form onSubmit={handleFinalReportingSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar flex-1">
              {(selectedLead.events && selectedLead.events.length > 0) ? (
                selectedLead.events.map((ev, idx) => {
                  const evData = finalReportingForm[ev.id] || { reporting_date: '', reporting_time: '' };
                  return (
                    <div key={ev.id} className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 space-y-4">
                      {selectedLead.events.length > 1 && (
                        <h5 className="font-bold text-indigo-400 text-xs uppercase tracking-wider font-mono border-b border-slate-800/80 pb-2.5 flex items-center justify-between">
                          <span>Event #{idx + 1}</span>
                        </h5>
                      )}
                      
                      {/* Row 1: Event Name (Full Width) */}
                      <div className="w-full">
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Event Name
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={ev.event_name || ev.event_type || ''}
                          className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                        />
                      </div>

                      {/* Row 2: Event Date & Event Start Time */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Event Date *
                          </label>
                          <input
                            type="date"
                            readOnly
                            value={ev.event_date || ''}
                            className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Event Start Time *
                          </label>
                          <TimePicker12Hour
                            disabled
                            value={ev.event_start_time || ev.event_time || ''}
                            onChange={() => {}}
                          />
                        </div>
                      </div>

                      {/* Row 3: Reporting Date, Reporting End Date, Reporting Time */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                            Reporting Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={evData.reporting_date}
                            onChange={(e) => setFinalReportingForm({ 
                              ...finalReportingForm, 
                              [ev.id]: { ...evData, reporting_date: e.target.value } 
                            })}
                            className="w-full h-10 bg-slate-900 border border-slate-750 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 text-xs text-slate-100 font-mono transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                            Reporting End Date
                          </label>
                          <input
                            type="date"
                            readOnly
                            value={ev.event_end_date || ev.Event_End_Date || (selectedLead?.Event_End_Date && selectedLead?.events?.length === 1 ? selectedLead.Event_End_Date : '') || ''}
                            className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                            Reporting Time *
                          </label>
                          <TimePicker12Hour
                            required
                            value={evData.reporting_time}
                            onChange={(val24) => setFinalReportingForm({ 
                              ...finalReportingForm, 
                              [ev.id]: { ...evData, reporting_time: val24 } 
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-950/60 p-5 rounded-xl border border-slate-800 space-y-4">
                  {/* Row 1: Event Name (Full Width) */}
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Event Name
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={selectedLead.event_type || selectedLead.customer_name || 'Event'}
                      className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                    />
                  </div>

                  {/* Row 2: Event Date & Event Start Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Event Date *
                      </label>
                      <input
                        type="date"
                        readOnly
                        value={selectedLead.event_date || selectedLead.Reporting_date || ''}
                        className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Event Start Time *
                      </label>
                      <TimePicker12Hour
                        disabled
                        value={selectedLead.event_time || selectedLead.reporting_time || ''}
                        onChange={() => {}}
                      />
                    </div>
                  </div>

                  {/* Row 3: Reporting Date, Reporting End Date, Reporting Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                        Reporting Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={finalReportingForm['default']?.reporting_date || ''}
                        onChange={(e) => setFinalReportingForm({ 
                          ...finalReportingForm, 
                          'default': { ...finalReportingForm['default'], reporting_date: e.target.value } 
                        })}
                        className="w-full h-10 bg-slate-900 border border-slate-750 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 text-xs text-slate-100 font-mono transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                        Reporting End Date
                      </label>
                      <input
                        type="date"
                        readOnly
                        value={selectedLead.Event_End_Date || ''}
                        className="w-full h-10 bg-slate-900/90 border border-slate-800 rounded-lg px-3 text-xs text-slate-300 font-mono cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                        Reporting Time *
                      </label>
                      <TimePicker12Hour
                        required
                        value={finalReportingForm['default']?.reporting_time || ''}
                        onChange={(val24) => setFinalReportingForm({ 
                          ...finalReportingForm, 
                          'default': { ...finalReportingForm['default'], reporting_time: val24 } 
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}
                
              {/* Button: Centered */}
              <div className="flex justify-center items-center pt-4 border-t border-slate-800/80">
                 <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all cursor-pointer inline-flex items-center justify-center min-w-max"
                >
                  {isSaving ? 'Saving...' : 'Save Reporting Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Step 3 Follow-up Popup Modal */}
      {showStep3Popup && (selectedLead || activeTab === 'create') && (
        <div className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-2.5 sm:p-4 md:p-6 backdrop-blur-md overflow-y-auto">
          <div id="step3_followup_modal" className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-md w-full shadow-2xl p-4 sm:p-5 space-y-4 my-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans truncate">
                <span>📅</span> Follow-up Date &amp; Time
              </h4>
              <button
                type="button"
                onClick={() => setShowStep3Popup(false)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer border-0 bg-transparent shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-3.5 pr-0.5">
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg text-xs text-indigo-200">
                Please schedule the follow-up date to finalize quotation and set lead status to <strong>Quote Sent</strong>.
              </div>

              <div className="space-y-3.5 text-xs text-slate-300">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                    Follow-up Date <span className="text-rose-400">* (Required)</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={step3FollowUpDate}
                    onChange={(e) => setStep3FollowUpDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-lg py-2 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                    Follow-up Time <span className="text-slate-500">(Optional)</span>
                  </label>
                  <TimePicker12Hour
                    value={step3FollowUpTime}
                    onChange={(val24) => setStep3FollowUpTime(val24)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono mb-1">
                    Follow-up Notes <span className="text-slate-500">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Summarize key client preferences, expected decision timeline, or notes..."
                    value={step3FollowUpNotes}
                    onChange={(e) => setStep3FollowUpNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-lg py-2 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowStep3Popup(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs border-0 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStep3FollowUp}
                disabled={isSaving || isCrmLocked || !step3FollowUpDate}
                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-lg text-xs border-0"
              >
                {isSaving ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Modal */}
      {errorDetails && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-2.5 sm:p-4 md:p-6 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-red-900/50 rounded-xl overflow-hidden max-w-lg w-full shadow-2xl p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <h4 className="font-bold text-red-400 text-base sm:text-lg flex items-center gap-2 truncate">
                <span>❌</span> {errorDetails.title}
              </h4>
              <button 
                onClick={() => setErrorDetails(null)}
                className="text-slate-400 hover:text-white transition-colors shrink-0 ml-2"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-slate-300 overflow-y-auto custom-scrollbar flex-1 pr-0.5">
              <p><strong>Reason:</strong> {errorDetails.reason}</p>
              {errorDetails.source && <p><strong>Source:</strong> {errorDetails.source}</p>}
              {errorDetails.failedFunction && <p><strong>Failed Function:</strong> {errorDetails.failedFunction}</p>}
              {errorDetails.database && <p><strong>Database:</strong> {errorDetails.database}</p>}
              {errorDetails.leadId && <p><strong>Lead ID:</strong> {errorDetails.leadId}</p>}
              {errorDetails.suggestedFix && (
                <div className="mt-4 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg text-blue-300">
                  <strong>Suggested Fix:</strong> {errorDetails.suggestedFix}
                </div>
              )}
              {process.env.NODE_ENV !== 'production' && errorDetails.stack && (
                <div className="mt-4 p-3 bg-slate-950 rounded-lg overflow-auto max-h-40 border border-slate-800 text-[10px] font-mono text-slate-500">
                  {errorDetails.stack}
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setErrorDetails(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Lead Popup Modal */}
      {showLostModal && selectedLead && (
        <div className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-2.5 sm:p-4 md:p-6 backdrop-blur-md overflow-y-auto">
          <div id="lost_lead_modal" className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-md w-full shadow-2xl p-4 sm:p-5 space-y-4 my-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans truncate">
                <span>💔</span> Mark Lead as Lost
              </h4>
              <button 
                onClick={() => setShowLostModal(false)}
                className="text-slate-500 hover:text-slate-350 cursor-pointer animate-none border-0 shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-3.5 pr-0.5">
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-xs text-red-200">
                Please select a mandatory reason and log notes to set lead status to <strong>Lost</strong>.
              </div>

              <div className="space-y-3.5 text-xs text-slate-300">
                <div>
                  <label className="block font-medium text-slate-400 mb-1">
                    Lost Reason * (Required)
                  </label>
                  <select
                    required
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">-- Select Reason --</option>
                    <option value="Budget Constraint">Budget Constraint</option>
                    <option value="Chose Competitor">Chose Competitor</option>
                    <option value="Event Cancelled / Postponed">Event Cancelled / Postponed</option>
                    <option value="No Response / Ghosted">No Response / Ghosted</option>
                    <option value="Desired Date Unavailable">Desired Date Unavailable</option>
                    <option value="Other">Other (Specify below)</option>
                  </select>
                </div>

                {lostReason === 'Other' && (
                  <div>
                    <label className="block font-medium text-slate-400 mb-1">
                      Specify Custom Lost Reason * (Required)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter custom lost reason..."
                      value={otherLostReason}
                      onChange={(e) => setOtherLostReason(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-medium text-slate-400 mb-1">
                    Lost Notes * (Required)
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Detail the exact reason client decided otherwise..."
                    value={lostNotes}
                    onChange={(e) => setLostNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowLostModal(false)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs animate-none border-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLostLead}
                disabled={isSaving || !lostReason || (lostReason === 'Other' && !otherLostReason) || !lostNotes}
                className="px-4 py-2 bg-gradient-to-r from-red-650 to-rose-650 hover:from-red-600 hover:to-rose-600 disabled:opacity-50 text-white font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-lg text-xs border-0"
              >
                {isSaving ? 'Processing...' : 'Mark as Lost'}
                <CheckSquare className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Cancel Confirmation Modal */}
      {showCancelConfirmPopup && (
        <div className="fixed inset-0 bg-black/85 z-55 flex items-center justify-center p-2.5 sm:p-4 md:p-6 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div id="lead_cancel_confirm_modal" className="bg-slate-850 border border-slate-750 rounded-xl overflow-hidden max-w-sm w-full shadow-2xl p-4 sm:p-5 space-y-4 my-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5 font-sans truncate">
                <span>⚠️</span> Mark Lead as Lost
              </h4>
              <button 
                onClick={() => setShowCancelConfirmPopup(false)}
                className="text-slate-500 hover:text-slate-350 cursor-pointer animate-none border-0 shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-slate-300 py-2 text-left overflow-y-auto custom-scrollbar flex-1">
              Are you sure you want to mark this lead as Lost?
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowCancelConfirmPopup(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer text-xs font-semibold border-0"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleCancelLead}
                disabled={isSaving}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl cursor-pointer shadow-lg text-xs border-0"
              >
                {isSaving ? 'Processing...' : 'Yes, Mark as Lost'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingPkgDetails && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20000] flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-y-auto animate-fade-in text-left text-xs bg-black/60">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] flex flex-col shadow-2xl relative text-slate-300">
            
            {!viewingPkgDetails.package_name ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                <span className="text-3xl text-rose-550">⚠️</span>
                <h4 className="text-sm font-bold text-slate-100">Package details not available.</h4>
                <p className="text-xs text-slate-400">The requested package specifications could not be resolved or found.</p>
                <button
                  type="button"
                  onClick={() => setViewingPkgDetails(null)}
                  className="px-4 py-2 bg-emerald-605 hover:bg-emerald-505 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (() => {
              // Internal parser helpers
              const getDeliverableValue = (pkg: any, key: string) => {
                const text = (pkg.deliverables || '').toLowerCase();
                const name = (pkg.package_name || '').toLowerCase();
                
                if (key === 'photos') {
                  const matches = pkg.deliverables?.match(/(\d+\s+edited\s+photos|\d+\+?\s+photos|unlimited\s+photos)/i);
                  if (matches) return matches[0];
                  if (text.includes('photographer') || text.includes('photos')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('photographer') || s.toLowerCase().includes('photo') || s.toLowerCase().includes('candid'));
                    if (match) return match;
                  }
                  return 'Standard High-Res Edited Digital Photos';
                }

                if (key === 'videos') {
                  if (text.includes('video') || text.includes('videographer') || text.includes('cinematic') || text.includes('teaser')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('video') || s.toLowerCase().includes('videographer') || s.toLowerCase().includes('cinematic') || s.toLowerCase().includes('teaser'));
                    if (match) return match;
                    return '4K Cinematic Highlight Video';
                  }
                  return 'Not Included';
                }

                if (key === 'reels') {
                  if (text.includes('reels') || text.includes('reel') || text.includes('short')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('reel') || s.toLowerCase().includes('short'));
                    if (match) return match;
                    return 'Reels Package Included';
                  }
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return 'Complimentary social reels package included';
                  }
                  return 'Not Included';
                }

                if (key === 'album') {
                  if (text.includes('album') || text.includes('book') || text.includes('print')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('album') || s.toLowerCase().includes('book') || s.toLowerCase().includes('print'));
                    if (match) return match;
                    return 'Standard Hardcover Photo Album';
                  }
                  return 'Not Included';
                }

                if (key === 'frames') {
                  if (text.includes('frame') || text.includes('canvas')) {
                    const sentences = parseTeamMembers(pkg.deliverables);
                    const match = sentences.find((s: string) => s.toLowerCase().includes('frame') || s.toLowerCase().includes('canvas'));
                    if (match) return match;
                    return '1 Wall Frame / Canvas Print';
                  }
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return '1 Large Dynamic Acrylic Wall Frame';
                  }
                  return 'Not Included';
                }

                return 'N/A';
              };

              const normalizeSalesText = (value: any): string => {
                if (typeof value === 'string') return value;
                if (Array.isArray(value)) {
                  return value.map(item => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item === 'object') {
                      return item.name || item.role || item.text || item.title || JSON.stringify(item);
                    }
                    return String(item || '');
                  }).join(' ');
                }
                if (value && typeof value === 'object') {
                  return value.name || value.role || value.text || value.title || JSON.stringify(value);
                }
                if (value == null) return '';
                return String(value);
              };

              const getTeamValue = (pkg: any, key: string) => {
                const text = (normalizeSalesText(pkg.team_members) + ' ' + normalizeSalesText(pkg.deliverables)).toLowerCase();
                
                if (key === 'photographer') {
                  if (text.includes('candid photographer') && text.includes('traditional photographer')) {
                    return '2 Photographers (1 Candid, 1 Traditional)';
                  }
                  if (text.includes('candid photographer') || text.includes('candid')) {
                    return '1 Professional Candid Photographer';
                  }
                  if (text.includes('traditional photographer')) {
                    return '1 Traditional Photographer';
                  }
                  if (text.includes('photographer')) {
                    const matches = text.match(/(\d+)\s+photographer/i);
                    return matches ? `${matches[1]} Lead Photographer(s)` : '1 Candid Photographer';
                  }
                  return '1 Candid Photographer';
                }

                if (key === 'videographer') {
                  if (text.includes('cinematographer') && text.includes('traditional videographer')) {
                    return '2 Videographers (1 Cinema, 1 Traditional)';
                  }
                  if (text.includes('cinematographer') || text.includes('cinematic videographer') || text.includes('cinematic')) {
                    return '1 Cinematic Videographer (4K Cinematic)';
                  }
                  if (text.includes('traditional videographer') || text.includes('videographer')) {
                    return '1 Traditional Videographer';
                  }
                  if (pkg.category?.toLowerCase().includes('photo') && !text.includes('video')) {
                    return '0 (Photography Only Package)';
                  }
                  return '1 Professional Videographer';
                }

                if (key === 'drone') {
                  if (text.includes('drone') || text.includes('aerial')) {
                    return '1 Certified Drone Pilot (Cinematic 4K Aerials)';
                  }
                  return '0 (Available as Premium Add-on)';
                }

                if (key === 'assistant') {
                  if (text.includes('assistant') || text.includes('lights') || text.includes('production manager')) {
                    return '1 Technical Field Assistant';
                  }
                  const crewMatch = text.match(/(\d+)\s+crew/i);
                  if (crewMatch) {
                    const total = parseInt(crewMatch[1], 10);
                    if (total > 3) return '1/2 Setup & Lights Assistants';
                  }
                  return '0 (Standard Crew Allocation)';
                }

                return 'N/A';
              };

              const getCoverageValue = (pkg: any, key: string) => {
                const cat = (pkg.category || '').toLowerCase();
                const name = (pkg.package_name || '').toLowerCase();

                if (key === 'hours') {
                  if (name.includes('pre-wedding') || name.includes('shoot') || name.includes('interior') || name.includes('product')) {
                    return '3 to 5 Event Shoot Hours';
                  }
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return 'Continuous Coverage (Up to 12 Hours)';
                  }
                  return 'Full Day (8 to 10 Hours)';
                }

                if (key === 'events') {
                  if (name.includes('platinum') || name.includes('diamond')) {
                    return 'Multi-event Coverage (Pre-wedding + Wedding covered)';
                  }
                  return '1 Main Day Event Coverage';
                }

                if (key === 'type') {
                  if (cat.includes('outdoor') || name.includes('outdoor')) {
                    return 'Exclusively Outdoor Locations';
                  }
                  if (cat.includes('interior') || name.includes('indoor') || name.includes('interior')) {
                    return 'Fully Indoor / Controlled Studio / Residential';
                  }
                  return 'Hybrid (Both Indoor Banquet & Outdoor Garden/Mandap)';
                }

                return 'N/A';
              };

              const getOffersValue = (pkg: any, key: string) => {
                const offer = pkg.seasonal_offer || '';
                
                if (key === 'seasonal') {
                  if (offer && offer !== 'None') return offer;
                  return 'No seasonal discount currently active';
                }

                if (key === 'complimentary') {
                  if (offer.toLowerCase().includes('complimentary') || offer.toLowerCase().includes('free')) {
                    return offer;
                  }
                  const price = pkg.price || 0;
                  if (price > 120000) {
                    return 'Complimentary Pre-Wedding Teaser videography & 1 Framed Canvas Print';
                  }
                  if (price > 80000) {
                    return 'Complimentary Wedding Film Teaser (1-min Reels Cut)';
                  }
                  return 'Standard Package Deliverables Apply';
                }

                return 'N/A';
              };

              const photosVal = getDeliverableValue(viewingPkgDetails, 'photos');
              const videosVal = getDeliverableValue(viewingPkgDetails, 'videos');
              const reelsVal = getDeliverableValue(viewingPkgDetails, 'reels');
              const albumVal = getDeliverableValue(viewingPkgDetails, 'album');
              const framesVal = getDeliverableValue(viewingPkgDetails, 'frames');

              const photographerVal = getTeamValue(viewingPkgDetails, 'photographer');
              const videographerVal = getTeamValue(viewingPkgDetails, 'videographer');
              const droneVal = getTeamValue(viewingPkgDetails, 'drone');
              const assistantVal = getTeamValue(viewingPkgDetails, 'assistant');

              const hoursVal = getCoverageValue(viewingPkgDetails, 'hours');
              const eventsVal = getCoverageValue(viewingPkgDetails, 'events');
              const typeVal = getCoverageValue(viewingPkgDetails, 'type');

              const seasonalVal = getOffersValue(viewingPkgDetails, 'seasonal');
              const complimentaryVal = getOffersValue(viewingPkgDetails, 'complimentary');

              return (
                <>
                  {/* Header */}
                  <div className="flex justify-between items-start border-b border-slate-800 pb-3.5">
                    <div>
                      <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase block mb-0.5">
                        ID: {viewingPkgDetails.package_id || 'Dynamic Link'}
                      </span>
                      <h4 className="text-sm sm:text-base font-extrabold text-slate-100 font-sans tracking-tight">
                        📋 {viewingPkgDetails.package_name || 'Package Specifications'}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ${
                        viewingPkgDetails.status === 'Active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}>
                        {viewingPkgDetails.status || 'Active'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewingPkgDetails(null)}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer"
                        title="Close Modal"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Pricing and Category Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-850">
                    <div>
                      <span className="text-slate-550 block font-bold text-[9px] uppercase font-mono mb-0.5">Category Group</span>
                      <span className="text-indigo-400 font-bold text-xs">{normalizeCategory(viewingPkgDetails.category)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-550 block font-bold text-[9px] uppercase font-mono mb-0.5">Standard Package Rate</span>
                      <span className="text-emerald-400 font-mono font-black text-sm">
                        ₹{viewingPkgDetails.price ? viewingPkgDetails.price.toLocaleString('en-IN') : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Custom Info Banner */}
                  {(viewingPkgDetails.event_type || viewingPkgDetails.duration || viewingPkgDetails.package_includes) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-850 text-xs">
                      {viewingPkgDetails.event_type && (
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-mono font-semibold mb-0.5">Event Type</span>
                          <span className="text-slate-200 font-medium">{viewingPkgDetails.event_type}</span>
                        </div>
                      )}
                      {viewingPkgDetails.duration && (
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-mono font-semibold mb-0.5">Duration</span>
                          <span className="text-slate-200 font-medium">{viewingPkgDetails.duration}</span>
                        </div>
                      )}
                      {viewingPkgDetails.package_includes && (
                        <div>
                          <span className="text-slate-500 block text-[9px] uppercase font-mono font-semibold mb-0.5">Key Focus</span>
                          <span className="text-slate-200 font-medium">{viewingPkgDetails.package_includes}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4.5 max-h-[50vh] overflow-y-auto pr-1">
                    {/* Deliverables Panel */}
                    <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-xl space-y-2.5">
                      <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                        📦 Key Deliverables Included
                      </span>
                      <div className="space-y-2 text-xs">
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Photos Included</span>
                          <span className="text-slate-200 font-semibold">{photosVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Videos Included</span>
                          <span className="text-slate-205 font-medium">{videosVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono font-mono">Reels Included</span>
                          <span className="text-slate-205 font-medium">{reelsVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Album Included</span>
                          <span className="text-slate-205 font-medium">{albumVal}</span>
                        </div>
                        <div className="flex flex-col bg-slate-900/40 p-1.5 rounded border border-transparent hover:border-slate-800/60">
                          <span className="text-slate-500 text-[10px] font-bold font-mono">Frames Included</span>
                          <span className="text-slate-205 font-medium">{framesVal}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right column: Crew & Coverage */}
                    <div className="space-y-4">
                      {/* Crew Members */}
                      <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-xl space-y-2.5">
                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                          👥 Team Members Included
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Photographer Count</span>
                            <span className="text-slate-250 font-medium">{photographerVal}</span>
                          </div>
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Videographer Count</span>
                            <span className="text-slate-250 font-medium">{videographerVal}</span>
                          </div>
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Drone Operator Count</span>
                            <span className="text-slate-250 font-medium">{droneVal}</span>
                          </div>
                          <div className="bg-slate-900/40 p-1.5 rounded">
                            <span className="text-slate-500 text-[9px] font-bold uppercase block mb-0.5">Assistant Count</span>
                            <span className="text-slate-250 font-medium">{assistantVal}</span>
                          </div>
                        </div>
                      </div>

                      {/* Coverage details */}
                      <div className="bg-slate-950/20 border border-slate-850 p-3.5 rounded-xl space-y-2.5">
                        <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase block border-b border-slate-850 pb-1.5 flex items-center gap-1.5">
                          📸 Coverage Details
                        </span>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                            <span className="text-slate-450 font-medium">Event Coverage Hours</span>
                            <span className="text-slate-200 font-bold">{hoursVal}</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                            <span className="text-slate-450 font-medium">Number of Events Covered</span>
                            <span className="text-slate-200 font-bold">{eventsVal}</span>
                          </div>
                          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded">
                            <span className="text-slate-450 font-medium">Outdoor/Indoor Coverage</span>
                            <span className="text-slate-200 font-bold">{typeVal}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Offers & Perks */}
                  <div className="bg-indigo-950/15 border border-indigo-900/40 p-3.5 rounded-xl space-y-2 text-xs">
                    <span className="text-[10px] font-bold text-indigo-400 font-mono tracking-wider uppercase block border-b border-indigo-950 pb-1">
                      🎁 Package Offers & complimentary Items
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                      <div>
                        <span className="text-slate-500 text-[9px] font-bold uppercase block">Seasonal Offer</span>
                        <span className="text-indigo-300 font-semibold">{seasonalVal}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[9px] font-bold uppercase block">Complimentary Items</span>
                        <span className="text-amber-400 font-semibold">{complimentaryVal}</span>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Conditions */}
                  <div className="bg-slate-950/30 border border-slate-850 rounded-xl p-3.5 space-y-1.5 text-xs">
                    <span className="text-slate-505 block font-bold text-[9px] uppercase font-mono tracking-wider">
                      📑 Contractual Terms & conditions
                    </span>
                    <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-850 max-h-24 overflow-y-auto leading-relaxed text-slate-350">
                      {viewingPkgDetails.terms_conditions || (
                        <p className="italic text-slate-500 font-sans">
                          Standard photo studio service guidelines apply: 50% advance for confirmation, 35% on event day, and 15% during delivery. Extra coverage hours chargeable.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer Controls */}
                  <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-slate-800">
                    {canEdit && activeTab === 'packages' && (
                      <button
                        type="button"
                        onClick={() => {
                          const pkg = viewingPkgDetails;
                          setEditingPackage(pkg);
                          setPkgForm({
                            package_name: pkg.package_name,
                            category: pkg.category,
                            price: pkg.price,
                            status: pkg.status,
                            deliverables: pkg.deliverables || '',
                            team_members: pkg.team_members || '',
                            seasonal_offer: pkg.seasonal_offer || '',
                            terms_conditions: pkg.terms_conditions || '',
                            event_type: pkg.event_type || '',
                            duration: pkg.duration || '',
                            package_includes: pkg.package_includes || ''
                          });
                          const parsed = parseTeamMembers(pkg.team_members);
                          setPkgTeamMembers(parsed.length > 0 ? parsed.map(s => { const r = parseQtyAndText(s); return { qty: r.qty, name: r.text }; }) : [{ qty: 1, name: '' }]);
                          const parsedDel = parseTeamMembers(pkg.deliverables);
                          setPkgDeliverablesList(parsedDel.length > 0 ? parsedDel.map(s => { const r = parseQtyAndText(s); return { qty: r.qty, name: r.text }; }) : []);
                          setIsAddFormOpen(false);
                          setViewingPkgDetails(null);
                        }}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold rounded-lg border border-slate-700 cursor-pointer transition-all text-xs"
                      >
                        Edit Details
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setViewingPkgDetails(null)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer transition-all shadow-md text-xs"
                    >
                      Close Specs
                    </button>
                  </div>
                </>
              );
            })()}

          </div>
        </div>,
        document.body
      )}


      {/* Delete Package Confirmation / Safety Check Modal */}

      {deletingPackageId && (() => {
        const pkg = packages.find(p => p.package_id === deletingPackageId);
        if (!pkg) return null;

        const isUsed = (() => {
          const pkgId = deletingPackageId;
          const nameLower = (pkg.package_name || '').trim().toLowerCase();

          // 1. Check Leads
          const usedInLeads = (leads || []).some(lead => {
            const option = (lead.Select_Package_Option || '').trim().toLowerCase();
            return option === pkgId.toLowerCase() || option === nameLower;
          });

          // Also check LeadPackages
          const usedInLeadPackages = (leadPackages || []).some(lp => {
            return lp.package_id === pkgId || (lp.package_name || '').trim().toLowerCase() === nameLower;
          });

          // 2. Check Quotations
          const usedInQuotations = (quotations || []).some(quote => {
            return (
              quote.package_id === pkgId ||
              quote.selected_package_id === pkgId ||
              quote.Select_Package_Option === pkgId ||
              (quote.package_name || '').trim().toLowerCase() === nameLower
            );
          });

          // 3. Check Orders
          const usedInOrders = (orders || []).some(order => {
            return (order.package_name || '').trim().toLowerCase() === nameLower;
          });

          return usedInLeads || usedInLeadPackages || usedInQuotations || usedInOrders;
        })();

        return createPortal(
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20001] flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-y-auto animate-fade-in text-left text-xs bg-black/60">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] flex flex-col shadow-2xl relative text-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">🗑️</span>
                  <div className="min-w-0 truncate">
                    <h3 className="text-base font-bold text-white truncate">Delete Package</h3>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">Package ID: {pkg.package_id}</p>
                  </div>
                </div>
                {!isDeletingPackage && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletePackageError(null);
                      setDeletingPackageId(null);
                    }}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1 space-y-4 pr-0.5">
                {deletePackageError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <div className="space-y-1">
                      <p className="font-bold">Deletion Failed</p>
                      <p>{deletePackageError}</p>
                    </div>
                  </div>
                )}

                {isUsed ? (
                  <div className="space-y-4">
                    <p className="text-slate-300 text-xs leading-relaxed font-sans">
                      This package is already referenced in existing records (leads, quotes, or orders). You can deactivate it instead to preserve historic references.
                    </p>
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60">
                      <button
                        type="button"
                        disabled={isDeletingPackage}
                        onClick={() => {
                          setDeletePackageError(null);
                          setDeletingPackageId(null);
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg cursor-pointer transition-all text-xs border border-transparent"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingPackage}
                        onClick={async () => {
                          const selectedPackageId = pkg.package_id;
                          if (!selectedPackageId || typeof selectedPackageId !== 'string' || !selectedPackageId.trim()) {
                            setDeletePackageError('Invalid package ID. Cannot proceed with deletion.');
                            return;
                          }
                          try {
                            setIsDeletingPackage(true);
                            setDeletePackageError(null);
                            await deletePackage(selectedPackageId.trim());
                            setDeletingPackageId(null);
                            setPackageSuccessMsg('Package deleted successfully.');
                            setTimeout(() => setPackageSuccessMsg(null), 5000);
                          } catch (err: any) {
                            setDeletePackageError(err.message || String(err));
                          } finally {
                            setIsDeletingPackage(false);
                          }
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-all text-xs shadow-md disabled:opacity-50"
                      >
                        {isDeletingPackage ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-slate-200 text-xs leading-relaxed font-sans">
                      Are you sure you want to delete this package?
                    </p>
                    
                    {isDeletingPackage && (
                      <div className="text-indigo-400 font-mono text-[10px] animate-pulse flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deleting package from database...</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800/60">
                      <button
                        type="button"
                        disabled={isDeletingPackage}
                        onClick={() => {
                          setDeletePackageError(null);
                          setDeletingPackageId(null);
                        }}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg cursor-pointer transition-all text-xs border border-slate-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingPackage}
                        onClick={async () => {
                          const selectedPackageId = pkg.package_id;
                          if (!selectedPackageId || typeof selectedPackageId !== 'string' || !selectedPackageId.trim()) {
                            setDeletePackageError('Invalid package ID. Cannot proceed with deletion.');
                            return;
                          }
                          try {
                            setIsDeletingPackage(true);
                            setDeletePackageError(null);
                            await deletePackage(selectedPackageId.trim());
                            setDeletingPackageId(null);
                            setPackageSuccessMsg('Package deleted successfully.');
                            setTimeout(() => setPackageSuccessMsg(null), 5000);
                          } catch (err: any) {
                            setDeletePackageError(err.message || String(err));
                          } finally {
                            setIsDeletingPackage(false);
                          }
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-all text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isDeletingPackage ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <span>Delete</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* 2. Side-by-Side Comparison Modal */}
      {isComparingPkgs && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[20000] flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-y-auto animate-fade-in text-left text-xs bg-black/60">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] flex flex-col shadow-2xl relative text-slate-300">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 shrink-0">
              <div className="min-w-0 pr-2">
                <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase block mb-0.5">Dynamic comparison checklist</span>
                <h4 className="text-sm font-extrabold text-slate-100 font-sans tracking-tight truncate">
                  ⚖️ Side-by-Side Specifications Comparison ({selectedPkgIds.length} packages selected)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsComparingPkgs(false)}
                className="text-slate-450 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comparison Grid Table */}
            <div className="overflow-x-auto border border-slate-800/85 rounded-xl bg-slate-950/40 flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0F172A]">
                    <th className="p-3 text-left font-bold text-slate-400 font-mono text-[10px] uppercase w-48 border-r border-slate-800/60">Specification Parameter</th>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      if (!pkg) return null;
                      return (
                        <th key={id} className="p-3 text-left font-bold text-slate-100 border-r border-slate-850/60 last:border-r-0">
                          <div className="space-y-1">
                            <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded font-mono uppercase font-black border border-emerald-900/30">
                              {normalizeCategory(pkg.category)}
                            </span>
                            <h5 className="font-bold text-slate-100 mt-1 leading-tight">{pkg.package_name}</h5>
                            <span className="block font-mono text-emerald-400 font-extrabold text-[12px] pt-1">
                              ₹{pkg.price ? pkg.price.toLocaleString('en-IN') : 'N/A'}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Category Row */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">🏷️ Category</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans font-medium text-slate-200">
                          {pkg ? normalizeCategory(pkg.category) : 'General'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Pricing Row */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">💰 Price Rate</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-mono text-emerald-400 font-extrabold">
                          ₹{pkg?.price ? pkg.price.toLocaleString('en-IN') : 'N/A'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Deliverables */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">📦 Core Deliverables</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans leading-relaxed text-slate-300">
                          <div className="max-h-24 overflow-y-auto pr-1 whitespace-pre-line text-xs font-sans">
                            {pkg?.deliverables || <span className="italic text-slate-500">Not configured</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Team Members */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">👥 Crew Required</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-slate-300">
                          {pkg?.team_members || <span className="italic text-slate-500">Standard team allocation</span>}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Seasonal Offers */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">🎁 Seasonal offers</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-amber-400">
                          {pkg?.seasonal_offer && pkg.seasonal_offer !== 'None' ? pkg.seasonal_offer : <span className="italic text-slate-505">None active</span>}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Event Duration */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">⏱️ Duration Limit</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-slate-300">
                          {pkg?.category === 'Pre-Wedding' || pkg?.category === 'Outdoor' || pkg?.package_name?.toLowerCase().includes('shoot')
                            ? '3 to 5 Hours' 
                            : 'Full Day (8-10 Hours)'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Scope Condition */}
                  <tr className="border-b border-slate-800/60 hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">📷 Shoot Scope</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans text-slate-300">
                          {pkg?.category?.includes('Video') || pkg?.package_name?.toLowerCase().includes('video') || pkg?.package_name?.toLowerCase().includes('reel')
                            ? 'Cinematic Video' 
                            : 'Standard Multi-Crew (Photo/Video)'}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Row: Terms & Conditions */}
                  <tr className="hover:bg-slate-950/20 text-[11px]">
                    <td className="p-3 font-semibold text-slate-400 border-r border-slate-850/60 font-mono text-[10px] uppercase">📑 Terms & Conditions</td>
                    {selectedPkgIds.map((id) => {
                      const pkg = packages.find(p => p.package_id === id);
                      return (
                        <td key={id} className="p-3 border-r border-slate-850/40 last:border-r-0 font-sans leading-relaxed text-slate-305">
                          <div className="max-h-24 overflow-y-auto bg-slate-950/20 p-2 rounded border border-slate-900/65 text-slate-300 whitespace-pre-line text-[11px]">
                            {pkg?.terms_conditions || <span className="italic text-slate-500 font-sans">Standard contract rules apply</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Comparison Total Summary */}
            <div className="bg-[#0f172a] border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-left font-sans">
                <span className="text-slate-400 text-xs block font-mono font-bold">COMPARISON CUMULATIVE SUM</span>
                <span className="text-slate-200 text-[11px] leading-relaxed">Both packages are computed dynamically. Total discount is managed directly in the main lead profile session editor.</span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-slate-505 font-mono text-xs block">Combined Proposal Value:</span>
                <span className="font-mono text-emerald-400 font-black text-xl">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end pt-2 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsComparingPkgs(false)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer border border-transparent text-xs"
              >
                Close Comparison
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
};
