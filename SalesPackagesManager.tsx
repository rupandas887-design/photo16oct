import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ArrowLeft, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw, AlertCircle, MessageSquare
} from 'lucide-react';
import { Lead, CurrentStage, LeadPackage, EVENT_TYPES, PACKAGE_CATEGORIES, ACTIVE_STAGE_GROUPS, LeadEvent } from '../../types';
import { StatusText } from '../ui/StatusText';
import { EventDropdownCell } from '../EventDropdownCell';
import { UnifiedEventDropdownCell } from '../UnifiedEventDropdownCell';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { CameraLensStatsCard, CameraLensTheme } from '../CameraLensStatsCard';
import { ListSortFilter, SortOrder } from '../ui/ListSortFilter';
import { formatINR, formatIndianPhoneNumber, validateIndianMobile, formatTime12Hour, getCustomers, triggerAutoScrollAndFocus, normalizeCategory, parseTeamMembers, formatQtyItem, formatQtyArray, formatQtyList, formatDateDDMMYY, saveCustomCategoryToStorage, parsePackageDeliverables, ParsedDeliverableItem } from '../../utils';
import { SalesCalendar } from '../SalesCalendar';
import { CustomPackageMaster } from '../CustomPackageMaster';
import { AddressAutocomplete } from '../AddressAutocomplete';
import { jsPDF } from 'jspdf';
import { SHOOT_TYPES, LocalEditableInput, parseQtyAndText, combineQtyAndText, formatListToStructuredObjects, buildStep3EventPayloads, parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord, CompactQtyItemRowProps, CompactQtyItemRow, validateAndFormatTime, getLogoBase64FromUrl, generateQuotationPdfFileName, generateQuotationPDF, highlightText, LEAD_SOURCES, SalesModuleProps } from '../SalesUtils';
import { AddNoteModal } from '../AddNoteModal';

export interface SalesPackagesManagerProps {
  [key: string]: any;
}

export const SalesPackagesManager: React.FC<SalesPackagesManagerProps> = (props) => {
  const {
    isAddFormOpen,
    setIsAddFormOpen,
    editingPackage,
    setEditingPackage,
    pkgForm,
    setPkgForm,
    categoriesList,
    customCategory,
    setCustomCategory,
    pkgTeamMembers,
    setPkgTeamMembers,
    pkgDeliverablesList,
    setPkgDeliverablesList,
    pkgDeliverableInput,
    setPkgDeliverableInput,
    activeMasterRoles,
    activeMasterDeliverables,
    isSaving,
    setIsSaving,
    addPackage,
    updatePackage,
    handleSavePackage,
    packageSuccessMsg,
    setPackageSuccessMsg,
    dbCategoryError,
    catSearchQuery,
    setCatSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    PACKAGES_LIST,
    packages,
    setViewingPkgDetails,
    setDeletingPackageId,
    setIsComparingPkgs,
    canEdit
  } = props;

  // Ensure document scroll is never locked when viewing or interacting with package forms
  useEffect(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isAddFormOpen, editingPackage]);

  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const baselineStateRef = useRef<string | null>(null);

  const handleResetForm = () => {
    setIsAddFormOpen(false);
    setEditingPackage(null);
    setShowDiscardModal(false);
    baselineStateRef.current = null;
    setPkgForm({ 
      package_name: '', 
      category: 'Weddings', 
      price: 0, 
      status: 'Active', 
      deliverables: '', 
      team_members: '', 
      seasonal_offer: '',
      terms_conditions: '',
      event_type: '',
      duration: '',
      package_includes: ''
    });
    setPkgTeamMembers([{ qty: 1, name: '' }]);
    setPkgDeliverablesList([{ qty: 1, name: '' }]);
    setPkgDeliverableInput('');
    setCustomCategory('');
  };

  const checkIsDirty = (): boolean => {
    // Mode 1: Define New Service Package
    if (!editingPackage) {
      const hasName = Boolean(pkgForm.package_name && pkgForm.package_name.trim() !== '');
      const hasPrice = Boolean(pkgForm.price && Number(pkgForm.price) > 0);
      const hasCustomCat = Boolean(customCategory && customCategory.trim() !== '');
      const hasTeam = Boolean(pkgTeamMembers && pkgTeamMembers.some((m: any) => m.name && m.name.trim() !== ''));
      const hasDel = Boolean(pkgDeliverablesList && pkgDeliverablesList.some((d: any) => d.name && d.name.trim() !== ''));
      return hasName || hasPrice || hasCustomCat || hasTeam || hasDel;
    }

    // Mode 2: Edit Service Package
    if (!baselineStateRef.current) {
      const nameChanged = (pkgForm.package_name || '').trim() !== (editingPackage.package_name || '').trim();
      const priceChanged = Number(pkgForm.price || 0) !== Number(editingPackage.price || 0);
      const catChanged = (pkgForm.category || '') !== (editingPackage.category || '');
      return nameChanged || priceChanged || catChanged;
    }

    const currentSnapshot = JSON.stringify({
      name: (pkgForm.package_name || '').trim(),
      cat: pkgForm.category || '',
      price: Number(pkgForm.price) || 0,
      customCat: (customCategory || '').trim(),
      team: (pkgTeamMembers || []).map((m: any) => ({ qty: m.qty || 1, name: (m.name || '').trim() })).filter((m: any) => m.name !== ''),
      del: (pkgDeliverablesList || []).map((d: any) => ({ qty: d.qty || 1, name: (d.name || '').trim() })).filter((d: any) => d.name !== '')
    });

    return currentSnapshot !== baselineStateRef.current;
  };

  const handleCloseOrCancel = () => {
    if (checkIsDirty()) {
      setShowDiscardModal(true);
    } else {
      handleResetForm();
    }
  };

  const handleSave = async () => {
    if (!pkgForm.package_name.trim()) {
      alert('Please supply a package name.');
      return;
    }
    if (pkgForm.price <= 0) {
      alert('Please enter a valid price greater than zero.');
      return;
    }

    let resolvedCategory = pkgForm.category;
    if (resolvedCategory === 'CUSTOM_CATEGORY') {
      if (!customCategory.trim()) {
        alert('Please enter a valid custom category name.');
        return;
      }
      resolvedCategory = customCategory.trim();
      saveCustomCategoryToStorage(resolvedCategory);
    } else if (resolvedCategory) {
      saveCustomCategoryToStorage(resolvedCategory);
    }
    
    const filteredMembers = pkgTeamMembers.filter((item: any) => item.name && item.name.trim() !== '');
    const teamMembersStr = filteredMembers.length > 0 ? JSON.stringify(filteredMembers) : '';
    
    const filteredDeliverables = pkgDeliverablesList.filter((item: any) => item.name && item.name.trim() !== '');
    const deliverablesStr = filteredDeliverables.length > 0 ? JSON.stringify(filteredDeliverables) : '';
    
    const payload = {
      ...pkgForm,
      team_members: teamMembersStr,
      deliverables: deliverablesStr,
      category: resolvedCategory,
      event_type: pkgForm.event_type || resolvedCategory
    };
    
    try {
      setIsSaving(true);
      if (editingPackage) {
        await updatePackage(editingPackage.package_id, payload);
      } else {
        await addPackage(payload);
      }
      handleResetForm();
    } catch (err: any) {
      alert(`Failed to save package: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Dedicated Full-Page Form Mode (no centered modal, no backdrop overlay, natural page scrolling)
  if (isAddFormOpen || editingPackage) {
    return (
      <div id="add_edit_package_modal" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-7 md:p-8 space-y-6 text-left relative font-sans animate-fade-in shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* In-app Discard Changes Confirmation Modal */}
        {showDiscardModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in text-left">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
              <div className="flex items-center gap-3 text-amber-400">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h4 className="text-sm font-bold text-slate-100 font-sans">Discard unsaved changes?</h4>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">
                You have unsaved changes in this service package. Are you sure you want to discard them and return to the package catalog?
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer border border-transparent"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardModal(false);
                    handleResetForm();
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all cursor-pointer shadow-md border border-transparent"
                >
                  Discard & Exit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form Top Header & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCloseOrCancel}
              className="p-2 sm:px-3 sm:py-2 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold shadow-sm"
              title="Return to package list"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Packages</span>
            </button>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100 font-mono tracking-wide flex items-center gap-2">
                <span>{editingPackage ? '✏️ Edit Service Package' : '✨ Define New Service Package'}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {editingPackage 
                  ? `Editing package configuration for ${editingPackage.package_name || editingPackage.package_id}` 
                  : 'Configure rates, included team members, and client deliverables for this offering.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleCloseOrCancel}
              className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer font-medium border border-transparent shadow-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all cursor-pointer border border-transparent disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-1.5"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{isSaving ? 'Saving...' : editingPackage ? 'Update Package' : 'Save Package'}</span>
            </button>
            <button
              type="button"
              onClick={handleCloseOrCancel}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-800 hover:border-slate-700 flex items-center gap-1.5 text-xs shadow-sm"
              title="Close form"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Full-Page Form Fields with Normal Document Scrolling */}
        <div className="space-y-6 text-xs text-slate-300">
          {/* SECTION 1: PACKAGE DETAILS */}
          <div className="space-y-3.5 w-full">
            <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] font-mono text-emerald-400">
              Package Details
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {/* Package Name */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 text-xs">
                  Package Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Traditional Wedding Photography"
                  value={pkgForm.package_name}
                  onChange={(e) => setPkgForm({ ...pkgForm, package_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2.5 px-3.5 text-slate-200 focus:outline-none transition-colors text-xs font-sans"
                />
              </div>

              {/* Package Category */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 text-xs">
                  Package Category <span className="text-rose-400">*</span>
                </label>
                <select
                  value={pkgForm.category}
                  onChange={(e) => setPkgForm({ ...pkgForm, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2.5 px-3.5 text-slate-200 focus:outline-none transition-colors font-sans text-xs"
                >
                  {categoriesList.filter((c: string) => c !== 'CUSTOM_CATEGORY').map((cat: string) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="CUSTOM_CATEGORY">➕ Create Custom Category...</option>
                </select>
                {pkgForm.category === 'CUSTOM_CATEGORY' && (
                  <div className="animate-slide-down mt-2.5">
                    <label className="block text-amber-400 font-semibold mb-1 text-[11px]">New Custom Category Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Newborn Baby shoot"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) saveCustomCategoryToStorage(v);
                      }}
                      className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-500 rounded-xl py-2.5 px-3.5 text-slate-200 focus:outline-none font-sans text-xs"
                    />
                  </div>
                )}
              </div>

              {/* Package Price */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1 text-xs">
                  Package Price (INR) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-xs">₹</span>
                  <input
                    type="number"
                    placeholder="e.g. 25000"
                    value={pkgForm.price || ''}
                    onChange={(e) => setPkgForm({ ...pkgForm, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2.5 pl-8 pr-3.5 text-slate-200 focus:outline-none font-mono text-xs transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: TEAM MEMBERS INCLUDED */}
          <div className="border-t border-slate-800/80 pt-5 space-y-3.5 w-full">
            <div className="flex items-center justify-between">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] font-mono">
                Team Members Included
              </label>
            </div>

            {/* Column Header */}
            <div className="flex items-center gap-2 sm:gap-3 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="flex-1 min-w-0">Team Member Name / Role</div>
              <div className="w-[60px] sm:w-[75px] text-center shrink-0">Qty</div>
              <div className="w-9 sm:w-10 text-center shrink-0">Remove</div>
            </div>

            <div className="space-y-2.5 w-full">
              {pkgTeamMembers.map((member: any, index: number) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 sm:gap-3 w-full min-w-0 animate-fade-in"
                >
                  {/* Member Name */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="e.g. Candid Photographer"
                      value={member.name}
                      onChange={(e) => {
                        const newList = [...pkgTeamMembers];
                        newList[index] = { ...member, name: e.target.value };
                        setPkgTeamMembers(newList);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none font-sans text-xs"
                    />
                  </div>

                  {/* Qty */}
                  <div className="w-[60px] sm:w-[75px] shrink-0">
                    <input
                      type="number"
                      min="1"
                      value={member.qty || 1}
                      onChange={(e) => {
                        const newList = [...pkgTeamMembers];
                        newList[index] = { ...member, qty: Math.max(1, parseInt(e.target.value) || 1) };
                        setPkgTeamMembers(newList);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-emerald-400 focus:outline-none"
                    />
                  </div>

                  {/* Remove */}
                  <div className="w-9 sm:w-10 shrink-0 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const newList = pkgTeamMembers.filter((_: any, idx: number) => idx !== index);
                        setPkgTeamMembers(newList.length > 0 ? newList : [{ qty: 1, name: '' }]);
                      }}
                      className="w-9 h-9 sm:w-10 sm:h-10 text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPkgTeamMembers([...pkgTeamMembers, { qty: 1, name: '' }])}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add More</span>
            </button>
          </div>

          {/* SECTION 3: DELIVERABLES */}
          <div className="border-t border-slate-800/80 pt-5 space-y-3.5 w-full">
            <div className="flex items-center justify-between">
              <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px] font-mono">
                Deliverables
              </label>
            </div>

            {/* Column Header */}
            <div className="flex items-center gap-2 sm:gap-3 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <div className="flex-1 min-w-0">Deliverable Name / Description</div>
              <div className="w-[60px] sm:w-[75px] text-center shrink-0">Qty</div>
              <div className="w-9 sm:w-10 text-center shrink-0">Remove</div>
            </div>

            <div className="space-y-2.5 w-full">
              {pkgDeliverablesList.map((del: any, index: number) => (
                <div 
                  key={index} 
                  className="flex items-center gap-2 sm:gap-3 w-full min-w-0 animate-fade-in"
                >
                  {/* Deliverable Name */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="e.g. Traditional 30 Edited Photos"
                      value={del.name}
                      onChange={(e) => {
                        const newList = [...pkgDeliverablesList];
                        newList[index] = { ...del, name: e.target.value };
                        setPkgDeliverablesList(newList);
                        setPkgForm({ ...pkgForm, deliverables: JSON.stringify(newList) });
                      }}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-2 px-3 text-slate-200 focus:outline-none font-sans text-xs"
                    />
                  </div>

                  {/* Qty */}
                  <div className="w-[60px] sm:w-[75px] shrink-0">
                    <input
                      type="number"
                      min="1"
                      value={del.qty || 1}
                      onChange={(e) => {
                        const newList = [...pkgDeliverablesList];
                        newList[index] = { ...del, qty: Math.max(1, parseInt(e.target.value) || 1) };
                        setPkgDeliverablesList(newList);
                        setPkgForm({ ...pkgForm, deliverables: JSON.stringify(newList) });
                      }}
                      className="w-full bg-slate-950 border border-slate-750 focus:border-emerald-500 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-emerald-400 focus:outline-none"
                    />
                  </div>

                  {/* Remove */}
                  <div className="w-9 sm:w-10 shrink-0 flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const newList = pkgDeliverablesList.filter((_: any, idx: number) => idx !== index);
                        const updatedList = newList.length > 0 ? newList : [{ qty: 1, name: '' }];
                        setPkgDeliverablesList(updatedList);
                        setPkgForm({ ...pkgForm, deliverables: JSON.stringify(updatedList) });
                      }}
                      className="w-9 h-9 sm:w-10 sm:h-10 text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPkgDeliverablesList([...pkgDeliverablesList, { qty: 1, name: '' }])}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add More</span>
            </button>
          </div>
        </div>

        {/* Bottom Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
          <button
            type="button"
            onClick={handleCloseOrCancel}
            className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer font-medium border border-transparent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all cursor-pointer border border-transparent disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{isSaving ? 'Saving...' : editingPackage ? 'Update Package' : 'Save Package'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-left relative overflow-hidden font-sans">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            <span>Dynamic Package Catalog</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Manage core service offerings, pricing rates, and category bindings synced directly with Supabase.
          </p>
        </div>
        
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setEditingPackage(null);
              baselineStateRef.current = null;
              setShowDiscardModal(false);
              setPkgForm({ 
                package_name: '', 
                category: 'Weddings', 
                price: 0, 
                status: 'Active', 
                deliverables: '', 
                team_members: '', 
                seasonal_offer: '', 
                terms_conditions: '', 
                event_type: '', 
                duration: '', 
                package_includes: ''
              });
              setPkgTeamMembers([{ qty: 1, name: '' }]);
              setPkgDeliverablesList([{ qty: 1, name: '' }]);
              setPkgDeliverableInput('');
              setCustomCategory('');
              setIsAddFormOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer border border-transparent"
          >
            <Plus className="w-4 h-4" />
            <span>Define New Service Package</span>
          </button>
        )}
      </div>

      {packageSuccessMsg && (
        <div id="package_success_banner" className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-300 font-medium flex items-center justify-between shadow-lg animate-fade-in">
          <span className="font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{packageSuccessMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setPackageSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 p-1 rounded-lg hover:bg-emerald-900/40 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {dbCategoryError && (
        <div id="db_category_error_banner" className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400 font-medium space-y-1">
          <span className="font-bold flex items-center gap-1">⚠️ Database Schema Notice</span>
          <p>{dbCategoryError}</p>
        </div>
      )}

            {/* Custom Multi-Search & Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-center bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
              {/* Search Package Field */}
              <div className="relative w-full">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-tight">Search Package</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search package name..."
                    value={catSearchQuery}
                    onChange={(e) => setCatSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-8 pr-4 text-xs text-slate-250 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  {catSearchQuery && (
                    <button
                      onClick={() => setCatSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter by Category selection */}
              <div className="w-full">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-tight font-sans">Filter by Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-250 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Categories ({categoriesList.length})</option>
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Filter by Status selection */}
              <div className="w-full">
                <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-tight font-sans">Filter by Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-slate-250 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active Packages Only</option>
                  <option value="Inactive">Inactive Packages Only</option>
                </select>
              </div>
            </div>

            {/* Category Listing Grid */}
            <div className="space-y-6">
              {categoriesList.map((cat) => {
                // Respect category filter
                if (categoryFilter !== 'All' && cat !== categoryFilter) return null;

                const catPkgs = (packages || []).filter(
                  p => normalizeCategory(p.category) === cat && 
                  p.package_name.toLowerCase().includes(catSearchQuery.toLowerCase()) &&
                  (statusFilter === 'All' || p.status === statusFilter)
                );
                
                if (catPkgs.length === 0) return null;
                
                return (
                  <div key={cat} className="space-y-2.5 text-left animate-fade-in">
                    <h4 className="text-[10px] font-black font-mono tracking-wider text-slate-400 border-b border-slate-800 pb-1 uppercase flex justify-between items-center bg-slate-950/20 px-2 py-1 rounded">
                      <span>{cat}</span>
                      <span className="text-slate-500 font-mono">({catPkgs.length})</span>
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                      {catPkgs.map((pkg: any) => {
                        const deliverableItems = parsePackageDeliverables(pkg.deliverables);

                        return (
                          <div
                            key={pkg.package_id}
                            className="bg-slate-950/70 border border-slate-850 hover:border-slate-800 p-4 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-black/40 relative group"
                          >
                            {/* Card Top: Package Header & Deliverables */}
                            <div className="flex-1 flex flex-col">
                              {/* Header: ID & Status Badge */}
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="font-mono text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                  {pkg.package_id}
                                </span>
                                <span className={`px-2 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded border ${
                                  pkg.status === 'Active'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                                }`}>
                                  {pkg.status}
                                </span>
                              </div>

                              {/* Package Name */}
                              <h5 className="text-sm font-bold text-slate-100 leading-snug tracking-tight mb-3">
                                {pkg.package_name}
                              </h5>

                              {/* Deliverables: Professional readable list */}
                              <div className="flex-1 pb-3 flex flex-col justify-start">
                                {deliverableItems.length > 0 ? (
                                  <ul className="space-y-1.5 text-left">
                                    {deliverableItems.map((item: ParsedDeliverableItem, idx: number) => {
                                      const isLeadingSpecOrAdjective =
                                        /^(?:unlimited|approx|all|raw|free|complimentary)\b/i.test(item.name) ||
                                        /^\d+\s*(?:edited|photos?|pics?|pages?|sheets?|min|hrs?|hours?)/i.test(item.name);
                                      const showQty = item.hasQty && (item.qty > 1 || !isLeadingSpecOrAdjective);

                                      return (
                                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                                          <span className="text-emerald-400 font-bold select-none shrink-0 leading-tight mt-0.5">•</span>
                                          <span className="break-words">
                                            {showQty && (
                                              <strong className="font-semibold text-slate-100">{item.qty} × </strong>
                                            )}
                                            <span>{item.name}</span>
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-slate-500 italic py-1">
                                    No custom deliverables specified
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Card Bottom: Price and Actions */}
                            <div className="pt-3 border-t border-slate-850/80 mt-auto flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-sm sm:text-base font-bold text-emerald-400 tracking-tight">
                                  ₹{Number(pkg.price || 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                              
                              {canEdit && (
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPackage(pkg);
                                      setPkgForm({
                                        package_name: pkg.package_name,
                                        category: pkg.category,
                                        price: pkg.price,
                                        status: pkg.status as 'Active' | 'Inactive',
                                        deliverables: pkg.deliverables || '',
                                        team_members: pkg.team_members || '',
                                        seasonal_offer: pkg.seasonal_offer || '',
                                        terms_conditions: pkg.terms_conditions || '',
                                        event_type: pkg.event_type || pkg.category || '',
                                        duration: pkg.duration || '',
                                        package_includes: pkg.package_includes || ''
                                      });
                                      const parsedM = parsePackageDeliverables(pkg.team_members);
                                      const teamItems = parsedM.length > 0 ? parsedM.map(m => ({ qty: m.qty || 1, name: m.name })) : [{ qty: 1, name: '' }];
                                      setPkgTeamMembers(teamItems);
                                      const parsedD = parsePackageDeliverables(pkg.deliverables);
                                      const delItems = parsedD.length > 0 ? parsedD.map(d => ({ qty: d.qty || 1, name: d.name })) : [{ qty: 1, name: '' }];
                                      setPkgDeliverablesList(delItems);
                                      setCustomCategory('');
                                      baselineStateRef.current = JSON.stringify({
                                        name: (pkg.package_name || '').trim(),
                                        cat: pkg.category || '',
                                        price: Number(pkg.price) || 0,
                                        customCat: '',
                                        team: teamItems.map((m: any) => ({ qty: m.qty || 1, name: (m.name || '').trim() })).filter((m: any) => m.name !== ''),
                                        del: delItems.map((d: any) => ({ qty: d.qty || 1, name: (d.name || '').trim() })).filter((d: any) => d.name !== '')
                                      });
                                      setShowDiscardModal(false);
                                      setIsAddFormOpen(true);
                                    }}
                                    className="h-8 px-2 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white text-[10px] uppercase font-mono tracking-wider font-bold border border-slate-800 hover:border-slate-700 rounded-lg transition-all cursor-pointer text-center flex items-center justify-center whitespace-nowrap shadow-sm"
                                    title="Edit package details"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const nextStatus = pkg.status === 'Active' ? 'Inactive' : 'Active';
                                      await updatePackage(pkg.package_id, { status: nextStatus });
                                    }}
                                    className={`h-8 px-2 text-center text-[10px] uppercase font-mono tracking-wider font-bold border rounded-lg transition-all cursor-pointer flex items-center justify-center whitespace-nowrap shadow-sm ${
                                      pkg.status === 'Active'
                                        ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25 text-amber-400 hover:text-amber-300'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 text-emerald-400 hover:text-emerald-300'
                                    }`}
                                    title={pkg.status === 'Active' ? "Deactivate Package" : "Activate Package"}
                                  >
                                    {pkg.status === 'Active' ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingPackageId(pkg.package_id);
                                    }}
                                    className="h-8 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 hover:text-rose-300 text-[10px] uppercase font-mono tracking-wider font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center whitespace-nowrap shadow-sm"
                                    title="Delete Package"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
  );
};
