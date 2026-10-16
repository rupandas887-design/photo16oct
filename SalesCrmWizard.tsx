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
import { SHOOT_TYPES, LocalEditableInput, parseQtyAndText, combineQtyAndText, formatListToStructuredObjects, buildStep3EventPayloads, parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord, CompactQtyItemRowProps, CompactQtyItemRow, validateAndFormatTime, getLogoBase64FromUrl, generateQuotationPdfFileName, generateQuotationPDF, highlightText, LEAD_SOURCES, INITIAL_PACKAGES, SalesModuleProps, sortEventsAscending, normalizeCrmArray, getStep3FinalQuotationAmount } from '../SalesUtils';
import { AddNoteModal } from '../AddNoteModal';
import { TimePicker12Hour } from '../TimePicker12Hour';

export interface SalesCrmWizardProps {
  [key: string]: any;
}

export const SalesCrmWizard: React.FC<SalesCrmWizardProps> = (props) => {
  const {
    activeTab,
    setActiveTab,
    selectedLead,
    wizardStep,
    setWizardStep,
    createForm,
    setCreateForm,
    otherSource,
    setOtherSource,
    createEvents,
    setCreateEvents,
    showEventForm,
    setShowEventForm,
    eventForm,
    setEventForm,
    editingEventId,
    setEditingEventId,
    handleEventFormSubmit,
    handleDeleteEvent,
    selectedPkgIds,
    setSelectedPkgIds,
    isPkgDropdownOpen,
    setIsPkgDropdownOpen,
    pkgSearchQuery,
    setPkgSearchQuery,
    categoriesList,
    PACKAGES_LIST,
    packages,
    pkgPrices,
    setPkgPrices,
    pkgDeliverables,
    setPkgDeliverables,
    pkgNotes,
    setPkgNotes,
    leadDiscount,
    setLeadDiscount,
    subtotal,
    finalTotal,
    handleCreateLead,
    isSaving,
    crmWizardStep,
    setCrmWizardStep,
    crmHighestStep,
    setCrmHighestStep,
    wizardLeadData,
    setWizardLeadData,
    crmEvents,
    setCrmEvents,
    collapsedEventIds,
    setCollapsedEventIds,
    handleUpdateLeadCrm,
    handleCancelCrmEdit,
    crmToast,
    detectedCustomer,
    showDetectionPopup,
    setShowDetectionPopup,
    isApprovedUnlocked,
    isLeadLocked,
    isCrmLocked,
    isMultiEventLead,
    isLeadLost,
    isLeadConfirmed,
    currentRole,
    currentUser,
    users,
    canEdit,
    activeMasterRoles,
    activeMasterDeliverables,
    eventsReporting,
    setEventsReporting,
    formatDDMMYYYY,
    convertTo12Hour,
    quoteServices,
    setQuoteServices,
    isAddingInline,
    setIsAddingInline,
    newServiceName,
    setNewServiceName,
    newServiceQty,
    setNewServiceQty,
    newServicePrice,
    setNewServicePrice,
    editingServiceId,
    setEditingServiceId,
    editableInclusions,
    setEditableInclusions,
    editableDeliverables,
    setEditableDeliverables,
    quoteDiscount,
    setQuoteDiscount,
    quoteAdditional,
    setQuoteAdditional,
    generatedPDFBlobUrl,
    setGeneratedPDFBlobUrl,
    activeQuoteNum,
    setActiveQuoteNum,
    handleSavePdfAndPreview,
    handleSaveAndSendWhatsAppQuotation,
    setShowUnlockRequestModal,
    setSelectedUnlockLead,
    setUnlockRequestReason,
    setUnlockRequestCustomReason,
    setShowLostModal,
    setLostReason,
    setOtherLostReason,
    setLostNotes,
    setShowCancelConfirmPopup,
    getStrictLostReasonAndNotes,
    getLostReasonAndNotes,
    appendCompletedStep,
    showValidationError,
    showToastMsg,
    logStatusUpdateError,
    parseStatusUpdateError,
    statusHistory,
    orders,
    payments,
    isStep1Locked,
    isStep2Locked,
    isStep3Locked,
    resetForm,
    initEventsReporting,
    handleConfirmOrderAction,
    renderEventDetailsSection,
    renderStep3Workspace,
    customSource,
    setCustomSource,
    handleWizardNext,
    existingCustomerData,
    useExistingCustomerData,
    discardExistingCustomerData,
    confirmUseExistingCustomer,
    confirmDiscardExistingCustomer,
    customFieldValues,
    setCustomFieldValues,
    eventsList,
    setEventsList,
    getLeadCurrentStatus,
    getLeadCurrentStage,
    salesStatus,
    unlockingRecordId,
    setUnlockingRecordId,
    unlockReason,
    setUnlockReason,
    unlockCustomReason,
    setUnlockCustomReason,
    handleUnlockRecord,
    unlockRecord,
    handleSaveStep,
    openReportingDetailsModal,
    areReportingDetailsComplete,
    confirmForm,
    setConfirmForm,
    setShowConfirmModal,
    saveErrorPopup,
    setSaveErrorPopup,
    setDetectedCustomer,
    handleCheckExistingCustomer,
    createdLeadId,
    leads,
    handleOrderConfirmedSubmit,
    handleStatusSave,
    setSelectedLead,
    handlePackageDropdownChange,
    salesStaffName,
    setSalesStaffName,
    salesStaffMobile,
    setSalesStaffMobile,
    saveStep3DataRealtime,
    handleSavePackageOnly,
    renderQuotationAndStep4Section,
    showDuplicateWarning,
    duplicateCustomerInfo,
    handleDuplicateContinue,
    handleDuplicateCancel,
    leadPackages = props.leadPackages,
    dynamicFinalAmt = props.dynamicFinalAmt,
    quotations = props.quotations
  } = props;

  const leadSourcesList = props.LEAD_SOURCES || LEAD_SOURCES || [];
  const eventTypesList = props.EVENT_TYPES || EVENT_TYPES || [];
  const shootTypesList = props.SHOOT_TYPES || SHOOT_TYPES || [];
  const normalizedCrmEvents = normalizeCrmArray<LeadEvent>(crmEvents);
  const normalizedCreateEvents = normalizeCrmArray<LeadEvent>(createEvents);
  const sortedCrmEvents = sortEventsAscending(normalizedCrmEvents);

  const createdLeadRecord = createdLeadId ? leads?.find((l: Lead) => l.lead_id === createdLeadId) : null;
  const isCreatedLeadConfirmed = createdLeadRecord
    ? (['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(createdLeadRecord.status || '') ||
       (createdLeadRecord as any).current_status === 'Order Confirmed' ||
       (createdLeadRecord as any).booking_status === 'Confirmed' ||
       (getLeadCurrentStatus && getLeadCurrentStatus(createdLeadRecord) === 'Order Confirmed') ||
       (getLeadCurrentStage && ['Operations', 'Production', 'Post-Production', 'Completed'].includes(getLeadCurrentStage(createdLeadRecord))) ||
       (orders && orders.some((o: any) => o.lead_id === createdLeadRecord.lead_id && o.status !== 'Cancelled')) ||
       salesStatus === 'Order Confirmed' ||
       wizardLeadData.status === 'Order Confirmed')
    : (salesStatus === 'Order Confirmed' || wizardLeadData.status === 'Order Confirmed');

  const handleCreateFlowOrderConfirm = () => {
    const targetLead = createdLeadRecord || {
      lead_id: createdLeadId || 'NEW-LEAD',
      customer_name: createForm.customer_name,
      mobile: createForm.mobile,
      whatsapp_number: createForm.whatsapp_number,
      status: 'Create Quote',
      budget: finalTotal,
      package_price: finalTotal,
      Final_Quotation_Amount: finalTotal,
      Final_Package_Amount: finalTotal,
      final_package_amount: finalTotal,
      Select_Package_Option: selectedPkgIds[0] || createForm.selected_package_id || createForm.Select_Package_Option || 'Custom Package',
      events: createEvents && createEvents.length > 0 ? createEvents : []
    } as Lead;

    const activeEventsList = (createEvents && createEvents.length > 0) ? createEvents : (targetLead.events || []);
    const activePkgId = selectedPkgIds[0] || createForm.selected_package_id || createForm.Select_Package_Option || targetLead.Select_Package_Option || 'Custom Package';

    const leadForConfirmation: Lead = {
      ...targetLead,
      lead_id: createdLeadId || targetLead.lead_id || 'NEW-LEAD',
      customer_name: targetLead.customer_name || createForm.customer_name,
      mobile: targetLead.mobile || createForm.mobile,
      whatsapp_number: targetLead.whatsapp_number || createForm.whatsapp_number,
      status: targetLead.status || 'Create Quote',
      budget: finalTotal || targetLead.budget,
      package_price: finalTotal || targetLead.package_price,
      Final_Quotation_Amount: finalTotal || targetLead.Final_Quotation_Amount,
      Final_Package_Amount: finalTotal || targetLead.Final_Package_Amount,
      final_package_amount: finalTotal || targetLead.final_package_amount,
      Select_Package_Option: activePkgId,
      selected_package_id: activePkgId,
      events: activeEventsList,
      event_date: (activeEventsList[0]?.event_date) || targetLead.event_date || createForm.event_date || new Date().toISOString().split('T')[0],
      event_time: (activeEventsList[0]?.event_time) || targetLead.event_time || createForm.event_time || ''
    };

    if (handleConfirmOrderAction) {
      handleConfirmOrderAction(leadForConfirmation);
    } else {
      setSelectedLead(leadForConfirmation);
      const today = new Date().toISOString().split('T')[0];
      const linkedOrder = orders?.find((o: any) => o.lead_id === leadForConfirmation.lead_id);
      const linkedPayment = linkedOrder ? payments?.find((p: any) => p.order_id === linkedOrder.order_id) : null;
      const calcAdvance = linkedPayment 
        ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
        : (linkedOrder 
            ? (linkedOrder.advance_received ?? 0) 
            : (leadForConfirmation.advance_collected !== undefined && leadForConfirmation.advance_collected !== null && leadForConfirmation.advance_collected !== ''
                ? Number(leadForConfirmation.advance_collected) 
                : (wizardLeadData.advance_received !== undefined && wizardLeadData.advance_received !== null && wizardLeadData.advance_received !== ''
                    ? Number(wizardLeadData.advance_received)
                    : 0)));

      const step3Amount = getStep3FinalQuotationAmount(leadForConfirmation, {
        dynamicFinalAmt,
        wizardLeadData,
        quotations,
        leads,
        orders,
        leadPackages
      });

      setConfirmForm({
        ...confirmForm,
        package_name: packages?.find((p: any) => String(p.package_id) === String(activePkgId))?.package_name || activePkgId,
        quotation_amount: step3Amount || Number(leadForConfirmation.Final_Quotation_Amount) || 0,
        advance_received: calcAdvance,
        event_date: (activeEventsList[0]?.event_date) || leadForConfirmation.event_date || today,
        event_time: (activeEventsList[0]?.event_time) || leadForConfirmation.event_time || ''
      });
      if (initEventsReporting) {
        initEventsReporting(leadForConfirmation);
      }
      setShowConfirmModal(true);
    }
  };

  if (activeTab === 'create') {
    return (
      <>
        <div 
          id="create_lead_form"
          className="bg-[#030303] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col overflow-hidden relative max-h-[85vh] lg:max-h-[90vh]"
        >
            <button 
              type="button"
              onClick={() => { resetForm(); setActiveTab('list'); }}
              className="absolute top-2 right-3 z-20 p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center border border-transparent hover:border-slate-700/50 bg-slate-950/80"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {crmToast && (
              <div id="crm-create-toast-container" className={`mx-4 mt-4 p-3 rounded-xl shadow-lg flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200 shrink-0 ${
                crmToast.type === 'success' 
                  ? 'bg-emerald-950/90 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-950/90 border border-red-500/20 text-red-400'
              }`}>
                <span>{crmToast.type === 'success' ? '⚡' : '⚠️'}</span>
                <span className="text-[11px] font-mono font-bold whitespace-pre-wrap">{crmToast.message}</span>
              </div>
            )}

            {/* Wizard Progress Bar */}
            <div className="bg-slate-955/30 px-4 sm:px-6 py-1.5 border-b border-slate-800/50 shrink-0">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                {[
                  { step: 1, label: 'Customer' },
                  { step: 2, label: 'Event Info' },
                  { step: 3, label: 'CRM & Quotation' }
                ].map((item) => {
                  const isActive = wizardStep === item.step;
                  const isCompleted = wizardStep > item.step;
                  return (
                    <div key={item.step} className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-1">
                      <div className="w-full flex items-center gap-1">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black font-mono transition-all duration-300 ${
                          isActive 
                            ? 'bg-cyan-500 text-slate-950 ring-4 ring-cyan-500/10' 
                            : isCompleted 
                              ? 'bg-emerald-500 text-slate-955' 
                              : 'bg-slate-800 text-slate-500'
                        }`}>
                          {isCompleted ? '✓' : item.step}
                        </span>
                        <div className={`hidden sm:block flex-1 h-0.5 rounded transition-all duration-300 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-slate-800'
                        }`} />
                      </div>
                      <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${
                        isActive ? 'text-cyan-400' : isCompleted ? 'text-emerald-400' : 'text-slate-500'
                      }`}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Body: Content Fields */}
            <div className="p-3 sm:p-4 overflow-y-auto shrink min-h-0 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              
              {/* STEP 1: CUSTOMER DETAILS */}
              {wizardStep === 1 && (
                <div className="bg-slate-950/30 border border-slate-800/60 rounded-xl p-4 space-y-4 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-2 border-b border-slate-800/50 pb-2 mb-1">
                    <Users className="w-4 h-4 text-cyan-405" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">1. Customer Details</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Customer Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                        Customer Full Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={createForm.customer_name}
                        onChange={(e) => setCreateForm({ ...createForm, customer_name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-sans"
                      />
                    </div>

                    {/* Mobile Number */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                        Mobile Number *
                      </label>
                      <input
                        id="input_mobile"
                        type="text"
                        required
                        placeholder="e.g. 9876543210"
                        value={createForm.mobile}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                          setCreateForm({ ...createForm, mobile: val });
                          if (val.length === 10) {
                            handleCheckExistingCustomer('phone', val);
                          }
                        }}
                        onBlur={(e) => handleCheckExistingCustomer('phone', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
                      />
                    </div>

                    {/* WhatsApp Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-404">
                          WhatsApp Number
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (createForm.mobile) {
                              setCreateForm(prev => ({ ...prev, whatsapp_number: prev.mobile }));
                            }
                          }}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider cursor-pointer hover:underline"
                        >
                          Copy Mobile
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="WhatsApp contact number"
                        value={createForm.whatsapp_number}
                        onChange={(e) => setCreateForm({ ...createForm, whatsapp_number: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                        Email (Optional)
                      </label>
                      <input
                        type="email"
                        placeholder="customer@domain.com"
                        value={createForm.email}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCreateForm({ ...createForm, email: val });
                          if (val.includes('@') && val.length > 5 && (val.endsWith('.com') || val.endsWith('.in') || val.endsWith('.org'))) {
                            handleCheckExistingCustomer('email', val);
                          }
                        }}
                        onBlur={(e) => handleCheckExistingCustomer('email', e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all font-sans"
                      />
                    </div>

                    {/* Lead Source */}
                    <div className="space-y-2 text-left">
                      <div>
                        <label className="block text-xs font-semibold text-slate-404 mb-1.5">
                          Inbound Lead Channel Source *
                        </label>
                        <select
                          value={createForm.lead_source}
                          required
                          onChange={(e) => setCreateForm({ ...createForm, lead_source: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all cursor-pointer"
                        >
                          <option value="">Select Lead Source</option>
                          {(leadSourcesList || []).map(source => (
                            <option key={source} value={source}>{source}</option>
                          ))}
                        </select>
                      </div>
                      {createForm.lead_source === 'Other' && (
                        <div className="animate-fade-in-down">
                          <label className="block text-xs font-mono font-bold text-amber-500 mb-1.5">
                            Specify Custom Lead Source Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Billboard, Event Flyer"
                            value={otherSource}
                            onChange={(e) => setOtherSource(e.target.value)}
                            className="w-full bg-slate-955 border border-amber-500/50 rounded-lg py-2 px-3 text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                          />
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* STEP 2: EVENT DETAILS */}
              {wizardStep === 2 && (
                <div className="bg-slate-950/30 border border-slate-800/60 rounded-xl p-4.5 space-y-4 shadow-sm animate-fade-in text-left">
                  <div className="flex items-center gap-2 border-b border-slate-800/50 pb-2 mb-1 text-left">
                    <Calendar className="w-4 h-4 text-cyan-405" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">2. Event Details</span>
                  </div>

                  {renderEventDetailsSection(false)}
                </div>
              )}

              {/* STEP 3: PACKAGE SELECTION */}
              {wizardStep === 3 && (
                <div className="bg-slate-950/30 border border-slate-800/60 rounded-xl p-4.5 space-y-4 shadow-sm animate-fade-in text-left">
                  <div className="flex items-center gap-2 border-b border-slate-800/50 pb-2 mb-1">
                    <CheckSquare className="w-4 h-4 text-cyan-405" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">3. Package Selection</span>
                  </div>

                  {renderStep3Workspace(false)}
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="flex justify-between items-center gap-3 border-t border-slate-800/80 py-2 px-4 sm:px-5 bg-slate-950/40 backdrop-blur-md shrink-0">
              {/* Back or Cancel */}
              <div className="flex items-center gap-2">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep(wizardStep - 1)}
                    className="px-4.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl cursor-pointer border border-slate-850 hover:border-slate-700 transition-colors"
                  >
                    ← Back Step
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { resetForm(); setActiveTab('list'); }}
                    className="px-4.5 py-2 text-xs font-semibold bg-slate-805 hover:bg-slate-800 text-slate-300 rounded-xl cursor-pointer border border-slate-800 hover:border-slate-700/50 transition-colors"
                  >
                    Back
                  </button>
                )}
                {wizardStep === 2 && (!createdLeadId || leads.find(l => l.lead_id === createdLeadId)?.status === 'New Lead') && (
                  <div />
                )}
              </div>

              {/* Next or Save */}
              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={handleWizardNext}
                  disabled={isSaving || (wizardStep === 3 && selectedPkgIds.length === 0)}
                  className={`px-5.5 py-2 text-xs font-bold text-white rounded-xl shadow-lg border border-transparent transition-colors flex items-center gap-1.5 ${
                    wizardStep === 3 && selectedPkgIds.length === 0
                      ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                      : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/10 cursor-pointer'
                  }`}
                >
                  {isSaving ? 'Processing...' : 'Save & Continue →'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {!isCreatedLeadConfirmed && (
                    <button
                      type="button"
                      id="btn_step3_order_confirmed"
                      onClick={handleCreateFlowOrderConfirm}
                      disabled={isSaving || (selectedPkgIds.length === 0 && !createForm.selected_package_id && !createForm.Select_Package_Option)}
                      className={`px-4 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 border-0 ${
                        (selectedPkgIds.length === 0 && !createForm.selected_package_id && !createForm.Select_Package_Option)
                          ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-950/20'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>ORDER CONFIRMED</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      if (salesStatus === 'Order Confirmed') {
                        handleOrderConfirmedSubmit(e);
                      } else {
                        handleStatusSave();
                      }
                    }}
                    disabled={isSaving}
                    className="px-5.5 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer border border-transparent transition-colors flex items-center gap-1.5"
                  >
                    {isSaving ? 'Saving...' : salesStatus === 'Order Confirmed' ? '🎉 Confirm Order & Transition' : '✍️ Create Quotation'}
                  </button>
                </div>
              )}
            </div>
          </div>

        {/* FRONT-LEVEL MODAL: Customer Already Registered Duplicate Warning */}
        {showDuplicateWarning && duplicateCustomerInfo && (
          <div id="duplicate_customer_warning_popup" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 text-left">
            <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    ⚠ Customer Already Registered
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    A registered customer was found with this phone number.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Customer Name:</span>
                  <span className="text-white font-semibold">{duplicateCustomerInfo.customer_name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Created Date:</span>
                  <span className="text-white font-mono">{formatDateDDMMYY(duplicateCustomerInfo.created_date)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Current Status:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-zinc-300 border border-slate-700">
                    {duplicateCustomerInfo.status}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Event Date:</span>
                  <span className="text-white font-mono">{formatDateDDMMYY(duplicateCustomerInfo.event_date)}</span>
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Would you like to continue creating a new quotation/lead using this registered customer number, or cancel and return to the list?
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  id="btn_duplicate_cancel"
                  onClick={handleDuplicateCancel}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-zinc-300 font-semibold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer border border-slate-700/50 text-center"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  id="btn_duplicate_continue"
                  onClick={handleDuplicateContinue}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-955 font-bold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer text-center"
                >
                  CONTINUE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FRONT-LEVEL MODAL: Save Error Popup inside Create Flow */}
        {saveErrorPopup && (
          <div id="save_error_popup_create" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 text-left animate-fade-in">
            <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto text-xl font-bold font-mono">
                ❌
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  {saveErrorPopup.title}
                </h3>
                <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed font-sans">
                  {saveErrorPopup.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaveErrorPopup(null)}
                className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold uppercase rounded-lg transition-all border-0 shadow-md cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (selectedLead) {
    return (
      <>
        <div 
          id="lead_details_mobile_modal" 
          className="bg-[#030303] border border-slate-800 rounded-2xl w-full shadow-2xl flex flex-col overflow-hidden relative animate-fade-in text-left font-sans text-slate-100 max-h-[85vh] lg:max-h-[90vh]"
        >
            {/* Header: Sticky */}
            {!['Create Quote', 'Created Quotation', 'New Lead'].includes(getLeadCurrentStatus(selectedLead)) && (
              <div className={`py-2.5 px-4 sm:px-5 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm shrink-0 ${
                isLeadLost && crmWizardStep === 3 ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-950/40 border-slate-850'
              }`}>
                {crmWizardStep !== 3 ? (
                  <div className="flex items-center gap-2 text-left flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 font-mono uppercase tracking-wider">
                      <span>💍</span> Digital Lead CRM Workspace — Client Board
                    </h3>
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-mono font-bold">Code: {selectedLead.lead_id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                      isLeadLost ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                      getLeadCurrentStage(selectedLead) === 'Sales' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                      getLeadCurrentStage(selectedLead) === 'Operations' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                      getLeadCurrentStage(selectedLead) === 'Production' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      Stage: {isLeadLost ? 'Lost Lead' : getLeadCurrentStage(selectedLead)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                      isLeadLost ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                    }`}>
                      Status: {getLeadCurrentStatus(selectedLead)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold font-mono uppercase tracking-wider ${isLeadLost ? 'text-rose-300' : 'text-slate-200'}`}>
                      Step 3: Package Configuration
                    </span>
                    {isLeadLost && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono font-bold uppercase flex items-center gap-1">
                        <span>💔</span> [ LOST LEAD ]
                      </span>
                    )}
                  </div>
                )}
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs rounded-xl border border-slate-700 font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1 shadow"
                >
                  Back to Leads
                </button>
              </div>
            )}

            {/* Custom Toast Alert */}
            {crmToast && (
              <div id="crm-toast-container" className={`mx-4 mt-1.5 p-1.5 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 shrink-0 ${
                crmToast.type === 'success' 
                  ? 'bg-emerald-950 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-950 border border-red-500/20 text-red-400'
              }`}>
                <span>{crmToast.type === 'success' ? '⚡' : '⚠️'}</span>
                <span className="text-[10px] font-mono font-bold whitespace-pre-wrap">{crmToast.message}</span>
              </div>
            )}

            {/* Event Completion CRM Lock Banner */}
            {isCrmLocked && (
              <div className="mx-4 sm:mx-5 mt-2 p-2.5 sm:p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-amber-300 font-mono text-xs sm:text-sm font-bold shadow-md animate-fade-in shrink-0">
                <span className="text-base sm:text-lg">🔒</span>
                <span>
                  {isMultiEventLead
                    ? "All events have ended. This CRM is now locked."
                    : "Event has ended. This CRM is now locked."}
                </span>
              </div>
            )}

            {/* Progress Bar & Indicators */}
            <div className={`w-full ${isLeadLost && crmWizardStep === 3 ? 'bg-rose-950/20 border-b border-rose-500/30' : 'bg-slate-950/20 border-b border-slate-850'} py-1.5 px-4 sm:px-5 shrink-0 justify-start text-left ${['Create Quote', 'Created Quotation', 'New Lead'].includes(getLeadCurrentStatus(selectedLead)) ? 'sticky top-0 z-10 backdrop-blur-sm' : ''}`}>
              <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-2">
                  <span className={`text-[10px] sm:text-xs font-mono font-bold uppercase tracking-widest text-left shrink-0 ${isLeadLost && crmWizardStep === 3 ? 'text-rose-400' : 'text-indigo-400'}`}>
                    Step {crmWizardStep} of 3:
                  </span>
                  <span className={`text-[10px] sm:text-xs font-semibold py-0.5 px-2 rounded border shrink-0 flex items-center gap-1.5 ${
                    isLeadLost && crmWizardStep === 3
                      ? 'text-rose-300 bg-rose-950/40 border-rose-500/30 font-mono font-bold'
                      : 'text-slate-300 bg-slate-800 border-slate-750'
                  }`}>
                    {crmWizardStep === 1 ? 'Customer Details' :
                     crmWizardStep === 2 ? 'Event Details' :
                     'Quotation Workspace'}
                    {isLeadLost && crmWizardStep === 3 && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1 py-0.2 rounded uppercase">
                        [ LOST LEAD ]
                      </span>
                    )}
                  </span>
                  <div className="flex-1 max-w-xs h-1 bg-slate-950 rounded-full overflow-hidden hidden sm:block ml-4">
                    <div 
                      className={`h-full transition-all duration-300 ${isLeadLost && crmWizardStep === 3 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                      style={{ width: `${(crmWizardStep / 3) * 100}%` }}
                    />
                  </div>
                </div>
                {['Create Quote', 'Created Quotation', 'New Lead'].includes(getLeadCurrentStatus(selectedLead)) && (
                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[10px] sm:text-xs rounded border border-slate-700 font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1 shadow shrink-0"
                  >
                    Back to Leads
                  </button>
                )}
              </div>
            </div>

            {/* Content container with horizontal padding */}
            <div id="crm-wizard-scroll-container" className="shrink min-h-0 overflow-y-auto p-2.5 sm:p-3">
              <div className="max-w-5xl mx-auto">
                <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
                  <fieldset disabled={isCrmLocked} className="space-y-3 border-0 p-0 m-0 min-w-0">
                    {crmWizardStep === 1 && (
                    <div className="space-y-4 animate-fade-in text-left">
                      <div className="border-b border-slate-800 pb-1.5">
                        <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                          <span className="p-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-mono">1</span>
                          <span>Customer Details</span>
                        </h3>
                        <p className="text-[10px] text-zinc-400 mt-0.5">Manage client contact identity, email correspondence, and location parameters.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-left">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Customer Name (Optional)</label>
                          <input
                            type="text"
                            value={wizardLeadData.customer_name || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, customer_name: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Mobile Number *</label>
                          <input
                            type="text"
                            value={wizardLeadData.mobile || ''}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
                              setWizardLeadData({ ...wizardLeadData, mobile: val });
                            }}
                            className="w-full bg-slate-955 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">WhatsApp Number</label>
                          <input
                            type="text"
                            value={wizardLeadData.whatsapp_number || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, whatsapp_number: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Email (Optional)</label>
                          <input
                            type="email"
                            value={wizardLeadData.email || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, email: e.target.value })}
                            className="w-full bg-slate-955 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Inbound Lead Channel Source *</label>
                          <select
                            value={wizardLeadData.lead_source || ''}
                            onChange={(e) => setWizardLeadData({ ...wizardLeadData, lead_source: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-white cursor-pointer select-element"
                            required
                          >
                            <option value="">── Choose Lead Source ──</option>
                            {(leadSourcesList || []).map(source => (
                              <option key={source} value={source}>{source}</option>
                            ))}
                          </select>
                          {wizardLeadData.lead_source === 'Other' && (
                            <div className="animate-fade-in-down mt-2">
                              <label className="block text-xs font-mono font-bold text-amber-500 mb-1.5">
                                Specify Custom Lead Source Name *
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Billboard, Event Flyer"
                                value={wizardLeadData.Specify_Custom_Lead_Source_Name || ''}
                                onChange={(e) => setWizardLeadData({ ...wizardLeadData, Specify_Custom_Lead_Source_Name: e.target.value })}
                                className="w-full bg-slate-955 border border-amber-500/50 rounded-lg py-2 px-3 text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                              />
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                   )}

                   {crmWizardStep === 2 && (
                     <div className="space-y-4 animate-fade-in text-left">
                       <div className="border-b border-slate-800 pb-1.5">
                         <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                           <span className="p-0.5 px-1.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-mono">2</span>
                           <span>Event Details</span>
                         </h3>
                         <p className="text-[11px] text-zinc-400 mt-1">Configure event metadata, starting schedules, reporting times, and lead origins.</p>
                       </div>
                       
                       {renderEventDetailsSection(true)}
                     </div>
                   )}

                   {crmWizardStep === 3 && (
                     <div className={`space-y-4 animate-fade-in text-left ${isLeadLost ? 'bg-rose-950/10 border border-rose-500/30 rounded-2xl p-3.5 sm:p-4' : ''}`}>
                       <div className={`border-b pb-1.5 flex items-center justify-between ${isLeadLost ? 'border-rose-500/30' : 'border-slate-800'}`}>
                         <h3 className={`text-xs sm:text-sm font-bold flex items-center gap-2 ${isLeadLost ? 'text-rose-400' : 'text-white'}`}>
                           <span className={`p-0.5 px-1.5 rounded text-[10px] font-mono ${isLeadLost ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-indigo-500/10 text-indigo-400'}`}>3</span>
                           <span>Quotation Workspace</span>
                         </h3>
                         {isLeadLost && (
                           <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded font-mono font-bold uppercase flex items-center gap-1">
                             <span>💔</span> [ LOST LEAD ]
                           </span>
                         )}
                       </div>
                       {renderStep3Workspace(true)}
                        <div className="hidden">
                        <div className="space-y-3.5 text-left">
                         <div>
                           <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Select Package Option *</label>
                           <select
                             id="hidden_legacy_select_package_option"
                             value={wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || ''}
                             onChange={(e) => handlePackageDropdownChange(e.target.value)}
                             className={`w-full bg-slate-955 border focus:outline-none rounded-lg py-1.5 px-3 text-xs cursor-pointer ${
                               !(wizardLeadData.Select_Package_Option || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option)
                                 ? 'border-rose-500/40 focus:border-rose-500 text-rose-200'
                                 : 'border-slate-800 focus:border-indigo-500 text-white'
                             }`}
                           >
                             <option value="">── Choose configuration package ──</option>
                             {(() => {
                               const currentPkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || '';
                               const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
                               const activePkgs = availablePkgs.filter(p => (!p.status || p.status.toLowerCase() === 'active') && String(p.package_id) !== 'Custom Package' && String(p.package_id) !== 'custom_package' && String(p.package_name) !== 'Custom Package');
                               if (currentPkgId && !activePkgs.some(p => String(p.package_id) === String(currentPkgId))) {
                                 const matched = availablePkgs.find(p => String(p.package_id) === String(currentPkgId));
                                 if (matched) {
                                   activePkgs.unshift(matched);
                                 } else {
                                   activePkgs.unshift({
                                     package_id: currentPkgId,
                                     package_name: `Package ${currentPkgId} (Legacy)`,
                                     price: wizardLeadData.package_cost || selectedLead?.Final_Quotation_Amount || 0,
                                     status: 'Active'
                                   } as any);
                                 }
                               }
                               return (
                                 <>
                                   {activePkgs.map((pkg) => (
                                     <option key={pkg.package_id} value={pkg.package_id}>
                                       {pkg.package_name} (₹{Number(pkg.price).toLocaleString('en-IN')})
                                     </option>
                                   ))}
                                   <option value="Custom Package">Custom Package</option>
                                 </>
                               );
                             })()}
                           </select>
                           {!(wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option) && (
                             <p className="text-rose-450 font-bold text-xs mt-1 font-mono animate-pulse flex items-center gap-1.5">
                               ⚠️ Please select a package before continuing.
                             </p>
                           )}
                         </div>
 
                         {(() => {
                           const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
                           const currentPkgId = wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option; 
                           let selectedPkg = availablePkgs.find(p => String(p.package_id) === String(currentPkgId)); 
                           if (!selectedPkg && currentPkgId) { 
                             selectedPkg = { package_id: currentPkgId, package_name: (currentPkgId === 'custom_package' || currentPkgId === 'Custom Package') ? 'Custom Package' : `Package ${currentPkgId} (Legacy)`, price: wizardLeadData.package_cost || 0, deliverables: wizardLeadData.deliverables || "", status: "Active" } as any; 
                           }
                           const selectedPkgId = selectedPkg?.package_id || '';
                          const inclusionsList = normalizeCrmArray<string>(editableInclusions[selectedPkgId]);
                          const deliverablesList = normalizeCrmArray<string>(editableDeliverables[selectedPkgId]);

                          return (
                            <div className="space-y-4 animate-fade-in">
                              {/* Sales Executive Details */}
                              <div className="hidden bg-slate-900/50 border border-slate-805/40 rounded-lg p-3 space-y-2.5 shadow-sm mt-3">
                                <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-slate-800 pb-1">
                                  <span>👤</span> Sales Executive Details
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                                      Sales Staff Name *
                                    </label>
                                    <input
                                      id="input_sales_staff_name"
                                      type="text"
                                      required
                                      value={salesStaffName}
                                      onChange={(e) => setSalesStaffName(e.target.value)}
                                      placeholder="E.g., Jane Doe"
                                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-sans transition-all"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                                      Sales Staff Mobile Number *
                                    </label>
                                    <input
                                      id="input_sales_staff_mobile"
                                      type="text"
                                      required
                                      value={salesStaffMobile}
                                      onChange={(e) => setSalesStaffMobile(e.target.value)}
                                      placeholder="E.g., 9876543210"
                                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 font-mono transition-all"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Single Package Base Price (₹) Field (Hidden visually per request) */}
                              <div className="hidden" style={{ display: 'none' }}>
                                <label className="block text-[11px] font-bold text-amber-400 uppercase tracking-wide font-mono flex items-center gap-1.5">
                                  <span>💰</span> Package Base Price (₹) *
                                </label>
                                <input
                                  type="number"
                                  value={wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null ? wizardLeadData.package_cost : (selectedPkg?.price || '')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const numVal = val === '' ? 0 : Number(val);
                                    setWizardLeadData(prev => ({
                                      ...prev,
                                      package_cost: val,
                                      package_price: numVal,
                                      budget: numVal,
                                      final_quoted_amount: numVal
                                    }));
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value;
                                    const numVal = val === '' ? 0 : Number(val);
                                    saveStep3DataRealtime(editableInclusions, editableDeliverables, wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option, numVal);
                                  }}
                                  placeholder="Enter package base price..."
                                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-amber-300 font-mono font-bold"
                                  required
                                />
                              </div>

                              {/* Event-Wise Configuration or Single Configuration */}
                              <div>
                                {(() => {
                                  const activeEventsList = (normalizedCrmEvents.length > 0) ? normalizedCrmEvents : normalizedCreateEvents;
                                  return (activeEventsList.length > 0) ? (
                                    activeEventsList.map((event, eventIdx) => {
                                      const isMulti = activeEventsList.length > 1;
                                      const evId = String(event.id || event.event_id || `EV-${eventIdx + 1}`);
                                      const eventKey = `${selectedPkgId}_${evId}`;
                                      const altKey = `Custom Package_${evId}`;
                                      const customKey = `custom_package_${evId}`;

                                      const directTm = event.team_members || (event as any).inclusions || (event as any).Team_Members || (event as any).team_members_included;
                                      const parsedDirectTm = directTm ? (Array.isArray(directTm) ? directTm.map((m: any) => {
                                        const { qty, text } = parseQtyAndText(m);
                                        return text ? combineQtyAndText(qty, text) : '';
                                      }).filter(Boolean) : null) : null;

                                      const rawEventInclusions = editableInclusions[eventKey] !== undefined
                                        ? editableInclusions[eventKey]
                                        : (editableInclusions[altKey] !== undefined
                                            ? editableInclusions[altKey]
                                            : (editableInclusions[customKey] !== undefined
                                                ? editableInclusions[customKey]
                                                : (editableInclusions[evId] !== undefined
                                                    ? editableInclusions[evId]
                                                    : (parsedDirectTm !== null
                                                        ? parsedDirectTm
                                                        : (isMulti ? [] : (inclusionsList.length > 0 ? [...inclusionsList] : []))))));
                                      const eventInclusions = normalizeCrmArray<string>(rawEventInclusions);

                                      const directDel = event.deliverables || (event as any).deliverables_list || (event as any).Add_Deliverable || (event as any).deliverables_description;
                                      const parsedDirectDel = directDel ? (Array.isArray(directDel) ? directDel.map((d: any) => {
                                        const { qty, text } = parseQtyAndText(d);
                                        return text ? combineQtyAndText(qty, text) : '';
                                      }).filter(Boolean) : null) : null;

                                      const rawEventDeliverables = editableDeliverables[eventKey] !== undefined
                                        ? editableDeliverables[eventKey]
                                        : (editableDeliverables[altKey] !== undefined
                                            ? editableDeliverables[altKey]
                                            : (editableDeliverables[customKey] !== undefined
                                                ? editableDeliverables[customKey]
                                                : (editableDeliverables[evId] !== undefined
                                                    ? editableDeliverables[evId]
                                                    : (parsedDirectDel !== null
                                                        ? parsedDirectDel
                                                        : (isMulti ? [] : (deliverablesList.length > 0 ? [...deliverablesList] : []))))));
                                      const eventDeliverables = normalizeCrmArray<string>(rawEventDeliverables);

                                    const updateInclusionsForEvent = (newList: string[]) => {
                                      const updated = {
                                        ...editableInclusions,
                                        [eventKey]: newList,
                                        [altKey]: newList,
                                        [customKey]: newList,
                                        [evId]: newList
                                      };
                                      if (!isMulti) {
                                        updated[selectedPkgId] = newList;
                                        updated['Custom Package'] = newList;
                                        updated['custom_package'] = newList;
                                      }
                                      setEditableInclusions(updated);
                                      if (crmEvents && crmEvents.length > 0) {
                                        setCrmEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, team_members: newList, inclusions: newList } : e)));
                                      }
                                      if (createEvents && createEvents.length > 0) {
                                        setCreateEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, team_members: newList, inclusions: newList } : e)));
                                      }
                                      saveStep3DataRealtime(updated, editableDeliverables);
                                    };

                                    const updateDeliverablesForEvent = (newList: string[]) => {
                                      const updated = {
                                        ...editableDeliverables,
                                        [eventKey]: newList,
                                        [altKey]: newList,
                                        [customKey]: newList,
                                        [evId]: newList
                                      };
                                      if (!isMulti) {
                                        updated[selectedPkgId] = newList;
                                        updated['Custom Package'] = newList;
                                        updated['custom_package'] = newList;
                                      }
                                      setEditableDeliverables(updated);
                                      if (crmEvents && crmEvents.length > 0) {
                                        setCrmEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, deliverables: newList, deliverables_list: newList } : e)));
                                      }
                                      if (createEvents && createEvents.length > 0) {
                                        setCreateEvents(prev => prev.map(e => (String(e.id || e.event_id) === evId ? { ...e, deliverables: newList, deliverables_list: newList } : e)));
                                      }
                                      saveStep3DataRealtime(editableInclusions, updated);
                                    };

                                    const startDateStr = formatDDMMYYYY(event.event_start_date || event.event_date);
                                    const endDateRaw = event.event_end_date || (event as any).Event_End_Date || '';
                                    const endDateStr = endDateRaw ? formatDDMMYYYY(endDateRaw) : 'N/A';
                                    const startTimeStr = event.event_start_time ? convertTo12Hour(event.event_start_time) : 'N/A';
                                    const endTimeStr = event.event_end_time ? convertTo12Hour(event.event_end_time) : 'N/A';
                                    const guestPaxVal = event.guest_pax !== '' && event.guest_pax !== null && event.guest_pax !== undefined ? event.guest_pax : 'N/A';
                                    const specificEventLocation = (event.event_location || (event as any).location || (event as any).venue_address || (event as any).venue || (event as any).event_venue || '').trim();
                                    const eventLocationDisplay = specificEventLocation || (!isMulti ? (wizardLeadData.event_location || selectedLead?.event_location || 'N/A') : 'N/A');

                                    return (
                                      <div key={evId} className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                                        {/* VERY SMALL COMPACT EVENT SUMMARY */}
                                        <div className="bg-slate-950/60 border border-slate-800/70 p-2.5 sm:p-3 rounded-lg text-left font-mono">
                                          <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="text-xs sm:text-sm font-bold text-slate-100 font-sans">
                                              {event.event_name || `Event ${eventIdx + 1}`}
                                            </span>
                                            {event.event_type && (
                                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold border border-slate-700">
                                                [{event.event_type}]
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[11px] text-slate-300 leading-tight flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                            <span>
                                              Start: <span className="text-slate-100 font-semibold">{startDateStr}{startTimeStr !== 'N/A' ? ` | ${startTimeStr}` : ''}</span>
                                            </span>
                                            {(endDateRaw || endTimeStr !== 'N/A') && (
                                              <>
                                                <span className="text-slate-500">•</span>
                                                <span>
                                                  End: <span className="text-slate-100 font-semibold">{endDateStr !== 'N/A' ? endDateStr : startDateStr}{endTimeStr !== 'N/A' ? ` | ${endTimeStr}` : ''}</span>
                                                </span>
                                              </>
                                            )}
                                            <span className="text-slate-500">•</span>
                                            <span>
                                              Guest Pax: <span className="text-slate-100 font-semibold">{guestPaxVal}</span>
                                            </span>
                                          </div>
                                          <div className="mt-2 pt-1.5 border-t border-slate-800/60 text-[11px] text-slate-300">
                                            <span className="text-slate-400 font-semibold uppercase font-mono text-[10px] mr-1.5">
                                              Event Address:
                                            </span>
                                            <span className="text-slate-100 font-medium break-words font-sans">
                                              {eventLocationDisplay}
                                            </span>
                                          </div>
                                        </div>

                                         {/* Team Members Included */}
                                         <div>
                                           <div className="mb-2">
                                             <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Team Members Included</label>
                                           </div>
                                           {eventInclusions.length === 0 ? (
                                             <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                               <p className="text-xs text-zinc-500 italic">No team members added yet.</p>
                                               <button
                                                 type="button"
                                                 onClick={() => {
                                                   const currentList = [...eventInclusions];
                                                   currentList.push("");
                                                   updateInclusionsForEvent(currentList);
                                                 }}
                                                 className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                               >
                                                 + Add Member
                                               </button>
                                             </div>
                                           ) : (
                                              <div className="space-y-1.5">
                                                {eventInclusions.map((item, idx) => (
                                                  <CompactQtyItemRow
                                                    key={`inc_ev_${evId}_${idx}`}
                                                    value={item}
                                                    options={activeMasterRoles}
                                                    placeholder="Type or select Role / Team Member..."
                                                    accentColor="indigo"
                                                    onChange={(newVal) => {
                                                      const currentList = [...eventInclusions];
                                                      currentList[idx] = newVal;
                                                      updateInclusionsForEvent(currentList);
                                                    }}
                                                    onDelete={() => {
                                                      const currentList = [...eventInclusions];
                                                      currentList.splice(idx, 1);
                                                      updateInclusionsForEvent(currentList);
                                                    }}
                                                  />
                                                ))}
                                                <div className="flex justify-end pt-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const currentList = [...eventInclusions];
                                                      currentList.push("");
                                                      updateInclusionsForEvent(currentList);
                                                    }}
                                                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                                  >
                                                    + Add Member
                                                  </button>
                                                </div>
                                              </div>
                                           )}
                                         </div>
                                         {/* Deliverables Description / Base Package Deliverables */}
                                         <div>
                                           <div className="mb-2">
                                             <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Deliverables Description / Base Package Deliverables</label>
                                           </div>
                                           {eventDeliverables.length === 0 ? (
                                             <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                               <p className="text-xs text-zinc-500 italic">No deliverables added yet.</p>
                                               <button
                                                 type="button"
                                                 onClick={() => {
                                                   const currentList = [...eventDeliverables];
                                                   currentList.push("");
                                                   updateDeliverablesForEvent(currentList);
                                                 }}
                                                 className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                               >
                                                 + Add Deliverable
                                               </button>
                                             </div>
                                           ) : (
                                              <div className="space-y-1.5">
                                                {eventDeliverables.map((item, idx) => (
                                                  <CompactQtyItemRow
                                                    key={`del_ev_${evId}_${idx}`}
                                                    value={item}
                                                    options={activeMasterDeliverables}
                                                    placeholder="Type or select Deliverable..."
                                                    accentColor="emerald"
                                                    onChange={(newVal) => {
                                                      const currentList = [...eventDeliverables];
                                                      currentList[idx] = newVal;
                                                      updateDeliverablesForEvent(currentList);
                                                    }}
                                                    onDelete={() => {
                                                      const currentList = [...eventDeliverables];
                                                      currentList.splice(idx, 1);
                                                      updateDeliverablesForEvent(currentList);
                                                    }}
                                                  />
                                                ))}
                                                <div className="flex justify-end pt-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const currentList = [...eventDeliverables];
                                                      currentList.push("");
                                                      updateDeliverablesForEvent(currentList);
                                                    }}
                                                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                                  >
                                                    + Add Deliverable
                                                  </button>
                                                </div>
                                              </div>
                                           )}
                                         </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                                     {/* Single Team Members Included */}
                                     <div>
                                       <div className="mb-2">
                                         <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Team Members Included</label>
                                       </div>
                                       {inclusionsList.length === 0 ? (
                                         <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                           <p className="text-xs text-zinc-500 italic">No team members added yet.</p>
                                           <button
                                             type="button"
                                             onClick={() => {
                                               const currentList = [...inclusionsList];
                                               currentList.push("");
                                               const updated = {
                                                 ...editableInclusions,
                                                 [selectedPkgId]: currentList
                                               };
                                               setEditableInclusions(updated);
                                               saveStep3DataRealtime(updated, editableDeliverables);
                                             }}
                                             className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                           >
                                             + Add Member
                                           </button>
                                         </div>
                                       ) : (
                                          <div className="space-y-1.5">
                                            {inclusionsList.map((item, idx) => (
                                              <CompactQtyItemRow
                                                key={`inc_single_${selectedPkgId}_${idx}`}
                                                value={item}
                                                options={activeMasterRoles}
                                                placeholder="Type or select Role / Team Member..."
                                                accentColor="indigo"
                                                onChange={(newVal) => {
                                                  const currentList = [...inclusionsList];
                                                  currentList[idx] = newVal;
                                                  const updated = {
                                                    ...editableInclusions,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableInclusions(updated);
                                                  saveStep3DataRealtime(updated, editableDeliverables);
                                                }}
                                                onDelete={() => {
                                                  const currentList = [...inclusionsList];
                                                  currentList.splice(idx, 1);
                                                  const updated = {
                                                    ...editableInclusions,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableInclusions(updated);
                                                  saveStep3DataRealtime(updated, editableDeliverables);
                                                }}
                                              />
                                            ))}
                                            <div className="flex justify-end pt-1">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const currentList = [...inclusionsList];
                                                  currentList.push("");
                                                  const updated = {
                                                    ...editableInclusions,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableInclusions(updated);
                                                  saveStep3DataRealtime(updated, editableDeliverables);
                                                }}
                                                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                                              >
                                                + Add Member
                                              </button>
                                            </div>
                                          </div>
                                       )}
                                     </div>

                                     {/* Single Deliverables Description */}
                                     <div>
                                       <div className="mb-2">
                                         <label className="block text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider">Deliverables Description / Base Package Deliverables</label>
                                       </div>
                                       {deliverablesList.length === 0 ? (
                                         <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex items-center justify-between">
                                           <p className="text-xs text-zinc-500 italic">No deliverables added yet.</p>
                                           <button
                                             type="button"
                                             onClick={() => {
                                               const currentList = [...deliverablesList];
                                               currentList.push("");
                                               const updated = {
                                                 ...editableDeliverables,
                                                 [selectedPkgId]: currentList
                                               };
                                               setEditableDeliverables(updated);
                                               saveStep3DataRealtime(editableInclusions, updated);
                                             }}
                                             className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                           >
                                             + Add Deliverable
                                           </button>
                                         </div>
                                       ) : (
                                          <div className="space-y-1.5">
                                            {deliverablesList.map((item, idx) => (
                                              <CompactQtyItemRow
                                                key={`del_single_${selectedPkgId}_${idx}`}
                                                value={item}
                                                options={activeMasterDeliverables}
                                                placeholder="Type or select Deliverable..."
                                                accentColor="emerald"
                                                onChange={(newVal) => {
                                                  const currentList = [...deliverablesList];
                                                  currentList[idx] = newVal;
                                                  const updated = {
                                                    ...editableDeliverables,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableDeliverables(updated);
                                                  saveStep3DataRealtime(editableInclusions, updated);
                                                }}
                                                onDelete={() => {
                                                  const currentList = [...deliverablesList];
                                                  currentList.splice(idx, 1);
                                                  const updated = {
                                                    ...editableDeliverables,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableDeliverables(updated);
                                                  saveStep3DataRealtime(editableInclusions, updated);
                                                }}
                                              />
                                            ))}
                                            <div className="flex justify-end pt-1">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const currentList = [...deliverablesList];
                                                  currentList.push("");
                                                  const updated = {
                                                    ...editableDeliverables,
                                                    [selectedPkgId]: currentList
                                                  };
                                                  setEditableDeliverables(updated);
                                                  saveStep3DataRealtime(editableInclusions, updated);
                                                }}
                                                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                                              >
                                                + Add Deliverable
                                              </button>
                                            </div>
                                          </div>
                                       )}
                                     </div>
                                    </div>
                                  );
                                })()}
                              </div>

                              <div className="mt-4 flex justify-end pb-2">
                                <button
                                  type="button"
                                  onClick={handleSavePackageOnly}
                                  disabled={isSaving}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded-lg shadow transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSaving ? 'Saving...' : 'Save Package'}
                                </button>
                              </div>

                              {renderQuotationAndStep4Section(true)}
                            </div>
                          );
                        })()}
                        </div>
                      </div>

                      {/* Status Update section removed from Step 3 as requested */}
                     </div>
                   )}
                  </fieldset>
                </form>
              </div>
            </div>

            {/* Footer Buttons: Sticky */}
            <div className="py-2.5 sm:py-1 px-3.5 sm:px-5 border-t border-slate-850 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-950/90 sm:bg-slate-950/40 sticky bottom-0 z-10 shrink-0 backdrop-blur-sm">
              <div className="order-2 sm:order-1 flex items-center gap-2 w-full sm:w-auto">
                {crmWizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setCrmWizardStep(crmWizardStep - 1)}
                    className="w-full sm:w-auto h-9 sm:h-7 px-3.5 py-1.5 sm:py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-mono font-bold uppercase rounded transition-all cursor-pointer border-0 flex items-center justify-center shrink-0"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedLead(null)}
                    className="w-full sm:w-auto h-9 sm:h-7 px-3.5 py-1.5 sm:py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-mono font-bold uppercase rounded transition-all cursor-pointer border-0 flex items-center justify-center shrink-0"
                  >
                    Back
                  </button>
                )}
                {crmWizardStep === 2 && selectedLead?.status === 'Order Confirmed' && (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirmPopup(true)}
                    disabled={isCrmLocked}
                    className={`w-full sm:w-auto h-9 sm:h-7 px-3.5 py-1.5 sm:py-1 text-xs font-mono font-bold uppercase rounded transition-all shadow-lg flex items-center justify-center ${
                      isCrmLocked ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50 shadow-none' : 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-rose-600/15'
                    } border border-transparent`}
                  >
                    Lost Lead
                  </button>
                )}
              </div>

              <div className="order-1 sm:order-2 grid grid-cols-1 min-[420px]:grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
                {(() => {
                  const hasCrmPackage = Boolean(
                    (wizardLeadData.selected_package_id && wizardLeadData.selected_package_id.trim() !== '') ||
                    ((wizardLeadData as any).Select_Package_Option && (wizardLeadData as any).Select_Package_Option.trim() !== '') ||
                    (selectedLead?.Select_Package_Option && selectedLead.Select_Package_Option.trim() !== '') ||
                    (selectedLead?.selected_package_id && selectedLead.selected_package_id.trim() !== '')
                  );

                  return (
                    <>
                      {crmWizardStep === 3 && !isLeadConfirmed && wizardLeadData.status !== 'Order Confirmed' && selectedLead?.status !== 'Order Confirmed' && (
                        <button
                          type="button"
                          id="btn_step3_order_confirmed"
                          onClick={() => {
                            if (!selectedLead) return;
                            if (handleConfirmOrderAction) {
                              handleConfirmOrderAction(selectedLead);
                            } else {
                              const today = new Date().toISOString().split('T')[0];
                              const linkedOrder = orders?.find(o => o.lead_id === selectedLead.lead_id);
                              const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
                              const calcAdvance = linkedPayment 
                                ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
                                : (linkedOrder 
                                    ? (linkedOrder.advance_received ?? 0) 
                                    : (selectedLead.advance_collected !== undefined && selectedLead.advance_collected !== null && selectedLead.advance_collected !== ''
                                        ? Number(selectedLead.advance_collected) 
                                        : (wizardLeadData.advance_received !== undefined && wizardLeadData.advance_received !== null && wizardLeadData.advance_received !== ''
                                            ? Number(wizardLeadData.advance_received) 
                                            : 0)));
                              
                              const step3Amount = getStep3FinalQuotationAmount(selectedLead, {
                                dynamicFinalAmt,
                                wizardLeadData,
                                quotations,
                                leads,
                                orders,
                                leadPackages
                              });
                              
                              setConfirmForm({
                                ...confirmForm,
                                package_name: packages?.find((p) => String(p.package_id) === String(wizardLeadData.selected_package_id || selectedLead.Select_Package_Option))?.package_name || wizardLeadData.selected_package_id || selectedLead.Select_Package_Option || '',
                                quotation_amount: step3Amount || Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_quotation_amount) || 0,
                                advance_received: calcAdvance,
                                event_date: selectedLead.event_date || today,
                                event_time: selectedLead.event_time || ''
                              });
                              if (initEventsReporting) {
                                initEventsReporting(selectedLead);
                              }
                              setShowConfirmModal(true);
                            }
                          }}
                          disabled={isSaving || isCrmLocked || !hasCrmPackage}
                          className={`w-full sm:w-auto h-9 sm:h-7 px-4 py-1.5 sm:py-1 text-xs font-mono font-bold uppercase rounded transition-all shadow-md flex items-center justify-center gap-1.5 border-0 ${
                            isCrmLocked
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50 shadow-none' :
                            !hasCrmPackage
                              ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-emerald-950/20'
                          }`}
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>ORDER CONFIRMED</span>
                        </button>
                      )}
                      <button
                        type="button"
                        id="btn_crm_save_step"
                        onClick={() => handleSaveStep(crmWizardStep)}
                        disabled={isSaving || isCrmLocked || (crmWizardStep === 3 && !hasCrmPackage)}
                        className={`w-full sm:w-auto h-9 sm:h-7 px-4 py-1.5 sm:py-1 text-xs font-mono font-bold uppercase rounded transition-all shadow-md flex items-center justify-center gap-1.5 border-0 ${
                          isCrmLocked
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50 shadow-none' :
                          crmWizardStep === 3 && !hasCrmPackage
                            ? 'bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed opacity-50 shadow-none'
                            : 'bg-indigo-650 hover:bg-indigo-600 text-white cursor-pointer'
                        }`}
                      >
                        {isSaving ? (
                          <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                        ) : null}
                        <span>{isSaving ? 'Saving...' : crmWizardStep === 3 ? ((isLeadConfirmed || ['Order Confirmed', 'Event Scheduled', 'Completed'].includes(wizardLeadData.status || selectedLead?.status || '')) ? 'Save' : 'SAVE & FOLLOW-UP') : 'Save & Next'}</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

        {saveErrorPopup && (
        <div id="save_error_popup" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto text-xl font-bold font-mono">
              ❌
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {saveErrorPopup.title}
              </h3>
              <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">
                {saveErrorPopup.message}
              </p>
            </div>
            <button
              onClick={() => setSaveErrorPopup(null)}
              className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold uppercase rounded-lg transition-all border-0 shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Customer Already Registered Duplicate Warning */}
      {showDuplicateWarning && duplicateCustomerInfo && (
        <div id="duplicate_customer_warning_popup" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 text-left animate-fade-in">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  ⚠ Customer Already Registered
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  A registered customer was found with this phone number.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 font-medium">Customer Name:</span>
                <span className="text-white font-semibold">{duplicateCustomerInfo.customer_name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 font-medium">Created Date:</span>
                <span className="text-white font-mono">{formatDateDDMMYY(duplicateCustomerInfo.created_date)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 font-medium">Current Status:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-zinc-300 border border-slate-700">
                  {duplicateCustomerInfo.status}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 font-medium">Event Date:</span>
                <span className="text-white font-mono">{formatDateDDMMYY(duplicateCustomerInfo.event_date)}</span>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Would you like to continue creating a new quotation/lead using this registered customer number, or cancel and return to the list?
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                id="btn_duplicate_cancel"
                onClick={handleDuplicateCancel}
                className="flex-1 bg-slate-800 hover:bg-slate-750 text-zinc-300 font-semibold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer border border-slate-700/50 text-center"
              >
                CANCEL
              </button>
              <button
                type="button"
                id="btn_duplicate_continue"
                onClick={handleDuplicateContinue}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-955 font-bold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer text-center"
              >
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}



{/* MODAL: Existing Customer Detection Pop-up */}
      {showDetectionPopup && detectedCustomer && (
        <div id="modal_existing_customer_detection" className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl w-full max-w-lg shadow-2xl relative p-6 space-y-5">
            {/* Ambient light ring */}
            <div className="absolute top-0 left-12 w-48 h-48 bg-indigo-500/[0.03] rounded-full blur-[60px] pointer-events-none" />

            <div className="flex items-start justify-between border-b border-slate-800 pb-3 relative z-10">
              <div>
                <h3 className="text-sm font-bold text-white tracking-widest font-mono flex items-center gap-1.5">
                  <span className="p-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] rounded font-black font-mono">DUPLICATION WARNING</span>
                  <span>EXISTING CUSTOMER DETECTED</span>
                </h3>
                <p className="text-[11px] text-indigo-300 mt-0.5 font-sans">
                  The phone index or email graph entered already maps to an active account.
                </p>
              </div>
              <button 
                onClick={() => { setShowDetectionPopup(false); setDetectedCustomer(null); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 relative z-10 text-slate-300 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-max">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 font-mono text-[9px] uppercase">
                    <th className="p-2 border border-slate-800">Customer Name</th>
                    <th className="p-2 border border-slate-800">Phone Number</th>
                    <th className="p-2 border border-slate-800">Lead Created Date</th>
                    <th className="p-2 border border-slate-800">Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-950/40 text-slate-300">
                    <td className="p-2 border border-slate-800 font-bold">{detectedCustomer.customer_name}</td>
                    <td className="p-2 border border-slate-800 font-mono">{detectedCustomer.mobile}</td>
                    <td className="p-2 border border-slate-800 font-mono">
                      {Array.isArray(detectedCustomer.leads) && detectedCustomer.leads.length > 0 
                        ? new Date(Math.max(...detectedCustomer.leads.map((l: any) => new Date(l.created_date || 0).getTime()))).toISOString().split('T')[0]
                        : 'N/A'}
                    </td>
                    <td className="p-2 border border-slate-800">
                      {Array.isArray(detectedCustomer.leads) && detectedCustomer.leads.length > 0
                        ? getLeadCurrentStatus(detectedCustomer.leads.slice().sort((a: any, b: any) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())[0])
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 p-1 border-t border-slate-800 mt-4 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowDetectionPopup(false);
                  setDetectedCustomer(null);
                  setActiveTab('list');
                }}
                className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-755 text-slate-200 border border-slate-700 rounded-lg cursor-pointer transition-all font-bold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDetectionPopup(false);
                  setDetectedCustomer(null);
                }}
                className="px-4 py-2 text-xs bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-505 hover:to-indigo-605 text-white rounded-lg shadow-md cursor-pointer transition-all font-bold"
              >
                Continue
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Business Owner Unlock Reason Prompt */}
      {unlockingRecordId && (
        <div id="modal_sales_record_unlock" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl w-full max-w-md shadow-2xl relative p-6 space-y-4">
            <div className="absolute top-0 left-12 w-48 h-48 bg-amber-500/[0.03] rounded-full blur-[60px] pointer-events-none" />
            
            <div className="flex items-start justify-between border-b border-slate-800 pb-3 relative z-10 font-sans">
              <div>
                <h3 className="text-sm font-bold text-white tracking-widest font-mono flex items-center gap-1.5">
                  <span className="p-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] rounded font-black font-mono">OWNER OVERRIDE</span>
                  <span>UNLOCK REASON REQUIRED</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  Provide a justification to unlock this protected sales record.
                </p>
              </div>
              <button 
                onClick={() => { setUnlockingRecordId(''); setUnlockReason('Data Correction'); setUnlockCustomReason(''); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const finalReason = unlockReason === 'Other' ? unlockCustomReason : unlockReason;
              if (!finalReason.trim()) {
                alert('A valid unlock reason is required.');
                return;
              }
              unlockRecord(unlockingRecordId, 'Sales', finalReason);
              setUnlockingRecordId('');
              setUnlockCustomReason('');
              setUnlockReason('Data Correction');
              alert('Record unlocked successfully for editing!');
            }} className="space-y-4 relative z-10 font-sans">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase font-mono tracking-wider">
                  Select Override Reason *
                </label>
                <select
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs text-slate-205 focus:outline-none focus:border-slate-700"
                >
                  <option value="Data Correction">Data Correction</option>
                  <option value="Customer Request">Customer Request</option>
                  <option value="Admin Override">Admin Override</option>
                  <option value="Other">Other (Type custom reason)</option>
                </select>
              </div>

              {unlockReason === 'Other' && (
                <div className="animate-fade-in">
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase font-mono tracking-wider">
                    Custom justification *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter unlock justification..."
                    value={unlockCustomReason}
                    onChange={(e) => setUnlockCustomReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-slate-700"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800 font-bold">
                <button
                  type="button"
                  onClick={() => { setUnlockingRecordId(''); setUnlockReason('Data Correction'); setUnlockCustomReason(''); }}
                  className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg cursor-pointer border border-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-sm cursor-pointer font-extrabold uppercase tracking-wide font-mono border border-amber-500/20"
                >
                  🔓 Confirm Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
    );
  }

  return null;
};
