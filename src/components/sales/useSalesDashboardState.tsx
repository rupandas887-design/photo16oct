import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw, MessageSquare, AlertCircle
} from 'lucide-react';
import { useRole, mapUserFieldsFromDb, INITIAL_PACKAGES, getStatusRank, isFollowUpDateTimeReached } from '../RoleContext';
import { supabaseClient } from '../../supabaseClient';
import { Lead, CurrentStage, LeadPackage, EVENT_TYPES, PACKAGE_CATEGORIES, ACTIVE_STAGE_GROUPS, LeadEvent } from '../../types';
import { formatINR, formatIndianPhoneNumber, validateIndianMobile, formatTime12Hour, getCustomers, triggerAutoScrollAndFocus, normalizeCategory, parseTeamMembers, formatQtyItem, formatQtyArray, formatQtyList, formatDateDDMMYY, getStoredCustomCategories, saveCustomCategoryToStorage, deserializeLeadEvents } from '../../utils';
import { jsPDF } from 'jspdf';
import { SHOOT_TYPES, LocalEditableInput, parseQtyAndText, combineQtyAndText, formatListToStructuredObjects, buildStep3EventPayloads, verifyAndFormatLeadPackagePayload, parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord, CompactQtyItemRowProps, CompactQtyItemRow, validateAndFormatTime, getLogoBase64FromUrl, generateQuotationPdfFileName, generateQuotationPDF, fetchAndResolveLatestPaymentData, highlightText, LEAD_SOURCES, SalesModuleProps, sortEventsAscending, normalizeCrmArray, checkIsEventEnded, checkIsLeadCrmLocked, getStep3FinalQuotationAmount, getSyncSavedQuotationAmount, resolveSavedQuotationAmount } from '../SalesUtils';
import { ListSortFilter, SortOrder } from '../ui/ListSortFilter';
import { StatusText } from '../ui/StatusText';
import { EventDropdownCell } from '../EventDropdownCell';
import { UnifiedEventDropdownCell } from '../UnifiedEventDropdownCell';
import { EventCategoryCell, getEventCategoryDateTimeTimestamp } from '../EventCategoryCell';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { CameraLensStatsCard, CameraLensTheme } from '../CameraLensStatsCard';
import { AddressAutocomplete } from '../AddressAutocomplete';
import { TimePicker12Hour } from '../TimePicker12Hour';
import { UpdatePaymentModal } from '../analytics/UpdatePaymentModal';
import { SearchablePackageSelect } from './SearchablePackageSelect';

export const useSalesDashboardState = (externalActiveTab?: string, externalSetActiveTab?: (tab: any) => void) => {
  const { 
    currentUser,
    currentRole, 
    leads: allLeads, 
    leadPackages, 
    orders: allOrders, 
    payments: allPayments, 
    production, 
    addLead, 
    updateLeadFollowUp, 
    confirmOrder,
    packages,
    addPackage,
    updatePackage,
    deletePackage,
    quotations: allQuotations,
    addQuotation,
    updateQuotation,
    updateLead,
    saveLeadPackages,
    unlockedRecords,
    unlockRecord,
    lockRecord,
    isRecordLocked,
    isDepartmentAllowedToEdit,
    deleteLead,
    deleteOrder,
    statusHistory,
    getLeadCurrentStatus,
    getLeadCurrentStage,
    addNotification,
    users,
    refreshData,
    paymentHistory
  } = useRole();

  const leads = currentRole === 'Sales Team' 
    ? allLeads.filter(l => l.sales_staff_id === currentUser?.id || l.sales_person === currentUser?.name) 
    : allLeads;
  const orders = currentRole === 'Sales Team' 
    ? allOrders.filter(o => leads.some(l => l.lead_id === o.lead_id)) 
    : allOrders;
  const payments = currentRole === 'Sales Team' 
    ? allPayments.filter(p => leads.some(l => l.lead_id === p.lead_id)) 
    : allPayments;
  const quotations = currentRole === 'Sales Team' 
    ? (allQuotations || []).filter((q: any) => leads.some(l => l.lead_id === q.lead_id)) 
    : (allQuotations || []);

  const [logoBase64, setLogoBase64] = useState<string>('');
  const [logoAspectRatio, setLogoAspectRatio] = useState<number>(1);
  const [unlockRequests, setUnlockRequests] = useState<any[]>([]);
  const [showStep3PaymentModal, setShowStep3PaymentModal] = useState(false);

  // Fetch unlock requests
  useEffect(() => {
    if (!supabaseClient) return;

    const fetchUnlockRequests = async () => {
      const { data, error } = await supabaseClient
        .from('unlock_requests')
        .select('*');
      
      if (!error && data) {
        const normalized = data.map((r: any) => {
          const isApproved = r.request_status === 'Approved' || r.status === 'Approved';
          const isCompleted = r.request_status === 'Completed' || r.status === 'Completed';
          const isRejected = r.request_status === 'Rejected' || r.status === 'Rejected';
          const effectiveStatus = isApproved ? 'Approved' : isCompleted ? 'Completed' : isRejected ? 'Rejected' : (r.request_status || r.status || 'Pending');
          return {
            ...r,
            request_status: effectiveStatus,
            status: effectiveStatus,
            reason: r.request_reason || r.reason || '',
            sales_staff_name: r.requested_by_name || r.sales_staff_name || '',
            sales_staff_id: r.requested_by_user_id || r.sales_staff_id || ''
          };
        });
        setUnlockRequests(normalized);
      }
    };

    fetchUnlockRequests();

    const channel = supabaseClient
      .channel('rt-unlock_requests-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'unlock_requests' }, () => {
        fetchUnlockRequests();
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  // Dynamic active master roles and deliverables loaded from Supabase master tables
  const [activeMasterRoles, setActiveMasterRoles] = useState<string[]>([]);
  const [activeMasterDeliverables, setActiveMasterDeliverables] = useState<string[]>([]);

  const loadActiveMasterItems = React.useCallback(async () => {
    try {
      let rList: string[] = [];
      let dList: string[] = [];

      if (supabaseClient) {
        const { data: rData } = await supabaseClient
          .from('custom_roles')
          .select('role_name')
          .eq('status', 'Active');
        if (rData && rData.length > 0) {
          rList = rData.map((r: any) => r.role_name);
        }

        const { data: dData } = await supabaseClient
          .from('custom_deliverables')
          .select('deliverable_name')
          .eq('status', 'Active');
        if (dData && dData.length > 0) {
          dList = dData.map((d: any) => d.deliverable_name);
        }
      }

      if (rList.length === 0) {
        const saved = localStorage.getItem('erp_custom_roles_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          rList = parsed.filter((r: any) => r.status === 'Active').map((r: any) => r.role_name);
        }
      }

      if (dList.length === 0) {
        const saved = localStorage.getItem('erp_custom_deliverables_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          dList = parsed.filter((d: any) => d.status === 'Active').map((d: any) => d.deliverable_name);
        }
      }

      if (rList.length > 0) setActiveMasterRoles(rList);
      if (dList.length > 0) setActiveMasterDeliverables(dList);
    } catch (err) {
      console.warn("Error fetching active custom master items in SalesModule:", err);
    }
  }, []);

  React.useEffect(() => {
    loadActiveMasterItems();
  }, [loadActiveMasterItems]);

  React.useEffect(() => {
    const preloadLogo = async () => {
      try {
        const logoUrl = 'https://aqifyxsimhqayfjwzzwj.supabase.co/storage/v1/object/public/img/logo%20(4)%20(1).png';
        const result = await getLogoBase64FromUrl(logoUrl);
        setLogoBase64(result.base64);
        setLogoAspectRatio(result.aspect);
      } catch (e) {
        console.warn('Failed to pre-load logo image:', e);
      }
    };
    preloadLogo();
  }, []);

  // Role permissions gate
  const canEdit = (currentRole === 'Sales Team' || currentRole === 'Business Owner') && 
                  (isDepartmentAllowedToEdit(currentRole, 'Quote Sent') || isDepartmentAllowedToEdit(currentRole, 'New Lead'));

  // Toggle modes
  const [internalTab, setInternalTab] = useState<'list' | 'create' | 'profiles' | 'packages' | 'calendar'>('list');
  const activeTab = externalActiveTab || internalTab;
  const setActiveTab = externalSetActiveTab || setInternalTab;

  // Leads export report handlers
  const handleDownloadCSV = () => {
    const headers = ["Lead ID", "Order ID", "Customer Name", "Mobile Number", "Event Type", "Event Date", "Current Stage", "Current Status", "Payment Status", "Created Date"];
    const rows = filteredLeads.map(l => {
      const ord = orders.find(o => o.lead_id === l.lead_id || o.order_id === l.lead_id || (l.order_id && o.order_id === l.order_id));
      const pay = ord ? payments?.find(p => p.order_id === ord.order_id) : null;
      const resolvedOrdId = ord?.order_id || l.order_id || (l as any).orders || 'N/A';
      return [
        l.lead_id,
        resolvedOrdId,
        l.customer_name === 'Inbound Prospect' ? '' : l.customer_name,
        l.mobile,
        l.event_type,
        l.event_date ? (formatDateDDMMYY(l.event_date) || l.event_date) : 'N/A',
        getLeadCurrentStatus(l),
        l.remarks.slice(0, 50).replace(/["\n\r]/g, ' '),
        pay ? pay.payment_status : 'Pending',
        l.created_date ? (formatDateDDMMYY(l.created_date) || l.created_date) : 'N/A'
      ];
    });
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Leads_Report_${appliedStartDate || 'all'}_to_${appliedEndDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadExcel = () => {
    const headers = ["Lead ID", "Order ID", "Customer Name", "Mobile Number", "Event Type", "Event Date", "Current Stage", "Current Status", "Payment Status", "Created Date"];
    const rows = filteredLeads.map(l => {
      const ord = orders.find(o => o.lead_id === l.lead_id || o.order_id === l.lead_id || (l.order_id && o.order_id === l.order_id));
      const pay = ord ? payments?.find(p => p.order_id === ord.order_id) : null;
      const resolvedOrdId = ord?.order_id || l.order_id || (l as any).orders || 'N/A';
      return [
        l.lead_id,
        resolvedOrdId,
        l.customer_name === 'Inbound Prospect' ? '' : l.customer_name,
        l.mobile,
        l.event_type,
        l.event_date ? (formatDateDDMMYY(l.event_date) || l.event_date) : 'N/A',
        getLeadCurrentStatus(l),
        l.remarks.slice(0, 50).replace(/["\t\n\r]/g, ' '),
        pay ? pay.payment_status : 'Pending',
        l.created_date ? (formatDateDDMMYY(l.created_date) || l.created_date) : 'N/A'
      ];
    });
    
    // Generate standard TSV structure compatible with native Excel import
    const content = [headers.join("\t"), ...rows.map(e => e.join("\t"))].join("\n");
    const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Leads_Report_${appliedStartDate || 'all'}_to_${appliedEndDate || 'all'}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const rowsHtml = filteredLeads.map(l => {
      const ord = orders.find(o => o.lead_id === l.lead_id || o.order_id === l.lead_id || (l.order_id && o.order_id === l.order_id));
      const pay = ord ? payments?.find(p => p.order_id === ord.order_id) : null;
      const resolvedOrdId = ord?.order_id || l.order_id || (l as any).orders || 'N/A';
      return `
        <tr>
          <td>${l.lead_id}</td>
          <td>${resolvedOrdId}</td>
          <td>${l.customer_name === 'Inbound Prospect' ? '' : l.customer_name}</td>
          <td>${l.mobile}</td>
          <td>${l.event_type}</td>
          <td>${l.event_date ? (formatDateDDMMYY(l.event_date) || l.event_date) : 'N/A'}</td>
          <td>${getLeadCurrentStatus(l)}</td>
          <td>${l.created_date ? (formatDateDDMMYY(l.created_date) || l.created_date) : 'N/A'}</td>
          <td>${pay ? pay.payment_status : 'Pending'}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Leads Directory Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 5px; color: #111; text-transform: uppercase; letter-spacing: 1px; }
            p { font-size: 11px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: right; border-top: 1px solid #eee; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>LEADS DIRECTORY REPORT</h1>
          <p>Generated on ${formatDateDDMMYY(new Date())} | Date Range: ${appliedStartDate || 'All'} to ${appliedEndDate || 'All'} | Records Count: ${filteredLeads.length}</p>
          <div className="overflow-x-auto w-full max-w-full">
<table>
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Mobile Number</th>
                <th>Event Type</th>
                <th>Event Date</th>
                <th>Current Status</th>
                <th>Created Date</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
</div>
          <div class="footer">Confidential Systems Report | ERP Sales Desk</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Package Management States
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [deletingPackageId, setDeletingPackageId] = useState<string | null>(null);
  const [isDeletingPackage, setIsDeletingPackage] = useState(false);
  const [deletePackageError, setDeletePackageError] = useState<string | null>(null);
  const [packageSuccessMsg, setPackageSuccessMsg] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<any | null>(null);
  const [viewingPkgDetails, setViewingPkgDetails] = useState<any | null>(null);
  const [catSearchQuery, setCatSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [pkgForm, setPkgForm] = useState({
    package_name: '',
    category: 'Weddings',
    price: 0,
    status: 'Active' as 'Active' | 'Inactive',
    deliverables: '',
    team_members: '',
    seasonal_offer: '',
    terms_conditions: '',
    event_type: '',
    duration: '',
    package_includes: ''
  });
  const [pkgTeamMembers, setPkgTeamMembers] = useState<{qty: number, name: string}[]>([{ qty: 1, name: '' }]);
  const [pkgDeliverablesList, setPkgDeliverablesList] = useState<{qty: number, name: string}[]>([]);
  const [pkgDeliverableInput, setPkgDeliverableInput] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isComparingPkgs, setIsComparingPkgs] = useState(false);
  const [dbCategoryError, setDbCategoryError] = useState<string | null>(null);

  React.useEffect(() => {
    const checkCategoryColumn = async () => {
      if (!supabaseClient) return;
      try {
        const { error } = await supabaseClient.from('packages').select('category').limit(0);
        if (error && (error.code === '42703' || error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('does not exist'))) {
          setDbCategoryError(
            `❌ Database Schema Alert: The 'category' column is missing from the 'packages' table in Supabase. Although the app is safely resolving categories using automated description serialization, categories are not stored as a dedicated column at the database level.`
          );
        }
      } catch (e) {
        console.warn('Failed to check category column:', e);
      }
    };
    checkCategoryColumn();
  }, [packages]);

  React.useEffect(() => {
    const handleClose = () => {
      setIsAddFormOpen(false);
      setEditingPackage(null);
      setViewingPkgDetails(null);
      setShowStep2Popup(false);
      setShowLostModal(false);
      setShowEventForm(false);
      setShowConfirmModal(false);
      setShowFinalReportingModal(false);
      setShowStep3Popup(false);
    };
    window.addEventListener('close-all-popups', handleClose);
    return () => window.removeEventListener('close-all-popups', handleClose);
  }, []);

  // Group active packages directly loaded from Supabase!
  const [customCategoryUpdateCounter, setCustomCategoryUpdateCounter] = useState(0);

  useEffect(() => {
    const handleCategoryUpdate = () => {
      setCustomCategoryUpdateCounter(prev => prev + 1);
    };
    window.addEventListener('custom-category-updated', handleCategoryUpdate);
    window.addEventListener('package-saved', handleCategoryUpdate);
    return () => {
      window.removeEventListener('custom-category-updated', handleCategoryUpdate);
      window.removeEventListener('package-saved', handleCategoryUpdate);
    };
  }, []);

  const categoriesList = React.useMemo(() => {
    const dbCats = Array.from(new Set((packages || []).map((p) => p.category))).filter(Boolean) as string[];
    const storedCats = getStoredCustomCategories();
    const allDbCats = Array.from(new Set([...dbCats, ...storedCats]));

    const normalizedDbCats = allDbCats.map(normalizeCategory);
    const normalizedPkgCats = PACKAGE_CATEGORIES.map(normalizeCategory);
    const customCats = normalizedDbCats.filter(c => !normalizedPkgCats.some(pc => pc.toLowerCase() === c.toLowerCase())).sort();
    return Array.from(new Set([...normalizedPkgCats, ...customCats]));
  }, [packages, customCategoryUpdateCounter]);

  // Synchronized Event Types: base types + any custom package categories + 'Other'
  const synchronizedEventTypes = React.useMemo(() => {
    const baseEventTypes = EVENT_TYPES.filter(t => t !== 'Other');
    const seenLower = new Set(baseEventTypes.map(t => t.toLowerCase()));

    const candidates: string[] = [];

    if (Array.isArray(categoriesList)) {
      categoriesList.forEach(c => {
        if (c && c !== 'CUSTOM_CATEGORY') candidates.push(c);
      });
    }

    (packages || []).forEach(p => {
      if (p.category && p.category !== 'CUSTOM_CATEGORY') candidates.push(p.category);
      if (p.event_type && p.event_type !== 'CUSTOM_CATEGORY') candidates.push(p.event_type);
    });

    getStoredCustomCategories().forEach(c => candidates.push(c));

    (leads || []).forEach(l => {
      if (l.event_type && l.event_type !== 'Other') candidates.push(l.event_type);
      if (Array.isArray(l.events)) {
        l.events.forEach((ev: any) => {
          if (ev.event_type && ev.event_type !== 'Other') candidates.push(ev.event_type);
        });
      }
    });

    const uniqueCustomTypes: string[] = [];
    candidates.forEach(cand => {
      const trimmed = (cand || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (lower === 'other' || lower === 'custom_category') return;
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        uniqueCustomTypes.push(trimmed);
      }
    });

    uniqueCustomTypes.sort((a, b) => a.localeCompare(b));

    return [...baseEventTypes, ...uniqueCustomTypes, 'Other'];
  }, [packages, categoriesList, leads, customCategoryUpdateCounter]);

  const PACKAGES_LIST = React.useMemo(() => {
    return categoriesList.map((cat) => ({
      categoryName: cat,
      items: (packages || [])
        .filter((p) => normalizeCategory(p.category) === cat && p.status === 'Active')
        .map((p) => ({
          id: p.package_id,
          name: p.package_name,
          cost: p.price,
          deliverables: p.deliverables || 'N/A',
          team_members: p.team_members || 'N/A',
          seasonal_offer: p.seasonal_offer || 'None'
        }))
    }));
  }, [categoriesList, packages]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [createEvents, setCreateEvents] = useState<LeadEvent[]>([]);
  const [crmEvents, setCrmEvents] = useState<LeadEvent[]>([]);
  const [crmWizardStep, setCrmWizardStep] = useState<number>(1);
  const [crmHighestStep, setCrmHighestStep] = useState<number>(1);
  const [saveErrorPopup, setSaveErrorPopup] = useState<{ title: string; message: string } | null>(null);

  const appendCompletedStep = (existingRemarks: string | undefined, step: number) => {
    const cleanRemarks = (existingRemarks || '').replace(/\[CRM_COMPLETED_STEP:\s*\d+\]/g, '').trim();
    return `${cleanRemarks}\n[CRM_COMPLETED_STEP: ${step}]`.trim();
  };

  const [wizardLeadData, setWizardLeadData] = useState({
    customer_name: '',
    mobile: '',
    whatsapp_number: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    Specify_Custom_Lead_Source_Name: '',
    client_residence_address: '',
    desired_event_shoot_type: '',
    // Step 2
    event_type: '',
    custom_event_name: '',
    event_name: '',
    event_event_shoot_type: '',
    event_date: '',
    event_start_date: '',
    event_end_date: '',
    event_time: '',
    reporting_time: '',
    event_location: '',
    guest_pax: "" as any,
    staff_pax: "" as any,
    lead_source: '',
    event_shoot_type: '',
    // Step 3
    selected_package_id: '',
    package_cost: 0,
    deliverables: '',
    notes: '',
    // Step 4
    budget: 0,
    final_quoted_amount: 0,
    remarks: '',
    next_follow_up_date: '',
      // Step 5
    status: '' as CurrentStage,
    // Order Confirmed Rule fields
    confirmed_event_date: '',
    confirmed_event_time: '',
    final_amount: 0,
    advance_received: 0,
    package_price: 0,
    deliverables_description: '',
    notes_special_customizations: '',
    quotation_discount: 0,
    additional_services_cost: 0,
    total_pax: 0,
    reference_source: '',
    lead_value: 0,
    lead_score: 0,
    booking_status: 'Pending',
  });

  const [crmToast, setCrmToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showValidationError = (fieldId: string, msg: string) => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.classList.add('!border-red-500', 'ring-1', '!ring-red-500');
      let msgEl = el.nextElementSibling as HTMLElement;
      if (!msgEl || !msgEl.classList.contains('validation-error-msg')) {
        msgEl = document.createElement('div');
        msgEl.className = 'validation-error-msg text-red-550 text-[10px] mt-1 font-bold animate-fade-in';
        el.parentNode?.insertBefore(msgEl, el.nextSibling);
      }
      msgEl.textContent = msg;
      
      const removeHighlight = () => {
        el.classList.remove('!border-red-500', 'ring-1', '!ring-red-500');
        if (msgEl && msgEl.parentNode) msgEl.parentNode.removeChild(msgEl);
        el.removeEventListener('input', removeHighlight);
        el.removeEventListener('change', removeHighlight);
      };
      el.addEventListener('input', removeHighlight);
      el.addEventListener('change', removeHighlight);
    } else {
      showToastMsg(msg, "error");
    }
  };

  const showToastMsg = (message: string, type: 'success' | 'error' = 'success') => {
    setCrmToast({ message, type });
    setTimeout(() => setCrmToast(null), 3000);
  };

  React.useEffect(() => {
    if (crmToast) {
      const timer = setTimeout(() => {
        const el = document.getElementById('crm-toast-container') || document.getElementById('crm-create-toast-container');
        if (el) {
          const rect = el.getBoundingClientRect();
          const isInViewport = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
          if (!isInViewport) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [crmToast]);

  const logStatusUpdateError = (params: {
    leadId: string | null;
    orderId: string | null;
    oldStatus: string | null;
    newStatus: string | null;
    updatePayload: any;
    insertPayload: any;
    dbResponse: any;
    fullError: any;
  }) => {
    console.group("%c CRM STATUS UPDATE ERROR LOG ", "background: #f43f5e; color: white; font-weight: bold; padding: 4px;");
    console.log("Lead ID:", params.leadId);
    console.log("Order ID:", params.orderId);
    console.log("Old Status:", params.oldStatus);
    console.log("New Status:", params.newStatus);
    console.log("Supabase UPDATE payload:", params.updatePayload);
    console.log("Supabase INSERT payload:", params.insertPayload);
    console.log("Database response:", params.dbResponse);
    console.log("Full error message:", params.fullError);
    console.groupEnd();
  };

  const parseStatusUpdateError = (errorMsg: string): { reason: string; suggestedFix: string } => {
    const msg = errorMsg.toLowerCase();
    
    let reason = errorMsg;
    let suggestedFix = "Please contact support or review the database connections and tables.";

    if (msg.includes("relation \"leads\" does not exist") || msg.includes("table name: leads\nmissing")) {
      reason = "Table 'leads' does not exist in the database schema.";
      suggestedFix = "Please ensure the 'leads' table is created in your Supabase database using the SQL editor.";
    } else if (msg.includes("relation \"lead_status_history\" does not exist") || msg.includes("relation \"public.lead_status_history\" does not exist")) {
      reason = "Table 'lead_status_history' does not exist in the database schema.";
      suggestedFix = "Create the 'lead_status_history' table in your Supabase database using: \n\nCREATE TABLE lead_status_history (\n  id SERIAL PRIMARY KEY,\n  lead_id TEXT,\n  order_id TEXT,\n  old_status TEXT,\n  new_status TEXT,\n  changed_by TEXT,\n  changed_by_role TEXT,\n  remarks TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);";
    } else if (msg.includes("column \"current_status\"") || msg.includes("column leads.current_status") || msg.includes("missing column name: current_status")) {
      reason = "Missing column \"current_status\" in table \"leads\".";
      suggestedFix = "Create the \"current_status\" column or update the database mapping using: \n\nALTER TABLE leads ADD COLUMN current_status TEXT;";
    } else if (msg.includes("column \"new_status\"") || msg.includes("column lead_status_history.new_status")) {
      reason = "Missing column \"new_status\" in table \"lead_status_history\".";
      suggestedFix = "Add the missing 'new_status' column to 'lead_status_history' table using: \n\nALTER TABLE lead_status_history ADD COLUMN new_status TEXT;";
    } else if (msg.includes("rls policy denied") || msg.includes("row-level security") || msg.includes("violates row-level security")) {
      reason = `RLS policy denied UPDATE on table "leads".`;
      suggestedFix = "Update the RLS policy to allow authenticated users to update lead records.";
    } else if (msg.includes("permission denied") || msg.includes("insufficient privilege")) {
      reason = `Permission denied by database. Details: ${errorMsg}`;
      suggestedFix = "Ensure the API client role has correct permissions (SELECT/INSERT/UPDATE) granted on the table.";
    } else if (msg.includes("not found") && msg.includes("leads")) {
      reason = `Lead ID invalid or lead record not found. Details: ${errorMsg}`;
      suggestedFix = "Verify that the Lead ID exists in the 'leads' table and has not been deleted.";
    } else if (msg.includes("lead_status_history insert failed because \"lead_id\" is null") || msg.includes("lead_id is null") || msg.includes("lead_id\" is null")) {
      reason = `"lead_status_history" insert failed because "lead_id" is NULL.`;
      suggestedFix = "Pass a valid \"lead_id\" before inserting the status history.";
    } else if (msg.includes("foreign key constraint")) {
      reason = `Foreign key constraint failed. Details: ${errorMsg}`;
      suggestedFix = "Check if the referenced records (e.g. lead_id, order_id) exist in their parent tables first.";
    } else if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
      reason = `Unique constraint violation. Details: ${errorMsg}`;
      suggestedFix = "Ensure that the record ID being inserted is unique and does not already exist.";
    } else if (msg.includes("network error") || msg.includes("failed to fetch") || msg.includes("database connection failed")) {
      reason = `Network error or failed to reach the database connection.`;
      suggestedFix = "Please check your internet connection or verify if your server/Supabase instances are active.";
    } else if (msg.includes("required field") || msg.includes("null value in column")) {
      reason = `Required database field is missing. Details: ${errorMsg}`;
      suggestedFix = "Ensure all required fields are filled and not null before submitting.";
    } else {
      const tableMatch = errorMsg.match(/table "([^"]+)"|relation "([^"]+)"/);
      const colMatch = errorMsg.match(/column "([^"]+)"/);
      if (tableMatch || colMatch) {
        const tableName = tableMatch ? (tableMatch[1] || tableMatch[2]) : "unknown table";
        const colName = colMatch ? colMatch[1] : "";
        reason = `Database operation failed on table "${tableName}"` + (colName ? ` for column "${colName}".` : ".");
        suggestedFix = `Verify the schema of "${tableName}" table. If "${colName}" column is missing, add it using ALTER TABLE ${tableName} ADD COLUMN ${colName} TEXT;`;
      }
    }

    return { reason, suggestedFix };
  };


  const [statusError, setStatusError] = useState<{ title: string; reason: string; suggestedFix: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalLeadId, setNoteModalLeadId] = useState("");
  const [noteModalOrderId, setNoteModalOrderId] = useState("");
  const [noteModalCustomerName, setNoteModalCustomerName] = useState("");

  const [unlockingRecordId, setUnlockingRecordId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('Data Correction');
  const [unlockCustomReason, setUnlockCustomReason] = useState('');

  // Step 2 and Step 3 Follow-up states
  const [showStep2Popup, setShowStep2Popup] = useState(false);
  const [step2FollowUpDate, setStep2FollowUpDate] = useState('');
  const [step2FollowUpNotes, setStep2FollowUpNotes] = useState('');

  const [step3FollowUpDate, setStep3FollowUpDate] = useState('');
  const [step3FollowUpTime, setStep3FollowUpTime] = useState('');
  const [step3FollowUpNotes, setStep3FollowUpNotes] = useState('');

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('Price too high');
  const [lostNotes, setLostNotes] = useState('');
  const [otherLostReason, setOtherLostReason] = useState('');
  
  // Unlock Request State
  const [showUnlockRequestModal, setShowUnlockRequestModal] = useState(false);
  const [unlockRequestReason, setUnlockRequestReason] = useState('Customer requested additional discount');
  const [unlockRequestCustomReason, setUnlockRequestCustomReason] = useState('');
  const [selectedUnlockLead, setSelectedUnlockLead] = useState<Lead | null>(null);

  // Helper function to resolve Lost Reason and Notes strictly and cleanly from fields
  const getStrictLostReasonAndNotes = (lead: Lead | null) => {
    if (!lead) return { reason: '', notes: '' };

    let rawReason = (lead.Lost_Reason || (lead as any).lost_reason || (lead as any).LostReason || (lead as any).lostReason || '').trim();
    let rawNotes = (lead.Lost_Notes || (lead as any).lost_notes || (lead as any).LostNotes || (lead as any).lostNotes || '').trim();

    // Clean any prefix like "Lost Reason:" or "Notes:" if user/system stored with label
    if (rawReason.toLowerCase().startsWith('lost reason:')) {
      rawReason = rawReason.replace(/^lost reason:\s*/i, '').trim();
    }
    if (rawNotes.toLowerCase().startsWith('lost notes:')) {
      rawNotes = rawNotes.replace(/^lost notes:\s*/i, '').trim();
    } else if (rawNotes.toLowerCase().startsWith('notes:')) {
      rawNotes = rawNotes.replace(/^notes:\s*/i, '').trim();
    }

    let cleanReason = rawReason;
    let cleanNotes = rawNotes;

    // Only if reason or notes is missing, parse from remarks
    if ((!cleanReason || !cleanNotes) && lead.remarks) {
      const text = lead.remarks;

      // Pattern 1: "Lost Reason: <reason>. Notes: <notes>"
      const explicitMatch = text.match(/Lost Reason:\s*([^.\n]+?)(?:\.\s*Notes:\s*([\s\S]*?))?(?=\n\[Update|\n\[Time|\[CRM_COMPLETED_STEP|$)/i);
      if (explicitMatch) {
        if (!cleanReason && explicitMatch[1]) cleanReason = explicitMatch[1].trim();
        if (!cleanNotes && explicitMatch[2]) cleanNotes = explicitMatch[2].trim();
      }

      // Pattern 2: Inspect [Update ...] entries in reverse order (most recent update first)
      if (!cleanReason || !cleanNotes) {
        const updateRegex = /\[Update[^\]]*\]:\s*([^\n]+)/gi;
        const matches = Array.from(text.matchAll(updateRegex));
        for (let i = matches.length - 1; i >= 0; i--) {
          const updateLine = matches[i][1];
          // Skip automated status updates or time tags that aren't lost lead details
          if (/^\[Time:|^Auto updated:/i.test(updateLine.trim())) continue;

          // Parse "<reason>. Neg Notes: <notes>. Next follow-up:"
          const parts = updateLine.match(/^([^.]+?)(?:\.\s*(?:Neg Notes|Notes):\s*([\s\S]*?))?(?:\.\s*Next follow-up:.*|$)/i);
          if (parts) {
            if (!cleanReason && parts[1]) cleanReason = parts[1].trim();
            if (!cleanNotes && parts[2]) cleanNotes = parts[2].trim();
            if (cleanReason) break;
          }
        }
      }
    }

    // Clean up trailing artifacts without destroying custom user notes
    if (cleanReason) {
      cleanReason = cleanReason
        .replace(/^WhatsApp:\s*\d+\s*/i, '')
        .replace(/^\[Update[^\]]*\]:\s*/i, '')
        .replace(/\.?\s*Neg Notes:.*$/i, '')
        .replace(/\.?\s*Next follow-up:.*$/i, '')
        .replace(/[,;]+$/, '')
        .trim();
    }

    if (cleanNotes) {
      cleanNotes = cleanNotes
        .replace(/\.?\s*Next follow-up:.*$/i, '')
        .replace(/[,;]+$/, '')
        .trim();
    }

    return {
      reason: cleanReason,
      notes: cleanNotes
    };
  };

  // Helper function to resolve Lost Reason and Notes
  const getLostReasonAndNotes = (lead: Lead | null, _historyList?: any[]) => {
    return getStrictLostReasonAndNotes(lead);
  };

  const [showCancelConfirmPopup, setShowCancelConfirmPopup] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    title: string;
    reason: string;
    source?: string;
    failedFunction?: string;
    database?: string;
    leadId?: string;
    suggestedFix?: string;
    stack?: string;
  } | null>(null);

  const showErrorHelper = (title: string, reason: string, failedFunction: string, leadId: string, suggestedFix: string, err?: any) => {
    console.error(`❌ ${title}\nReason: ${reason}\nFunction: ${failedFunction}\n`, err);
    setErrorDetails({
      title,
      reason: err?.message || reason,
      source: 'SalesModule.tsx',
      failedFunction,
      database: 'quotations / leads',
      leadId,
      suggestedFix,
      stack: err?.stack || ''
    });
  };

  const isLeadConfirmed = selectedLead
    ? (['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(selectedLead.status || '') ||
       (selectedLead as any).current_status === 'Order Confirmed' ||
       (selectedLead as any).booking_status === 'Confirmed' ||
       getLeadCurrentStatus(selectedLead) === 'Order Confirmed' ||
       ['Operations', 'Production', 'Post-Production', 'Completed'].includes(getLeadCurrentStage(selectedLead)) ||
       (orders && orders.some(o => o.lead_id === selectedLead.lead_id && o.status !== 'Cancelled')) ||
       wizardLeadData.status === 'Order Confirmed')
    : (wizardLeadData.status === 'Order Confirmed');

  const isApprovedUnlocked = selectedLead
    ? (selectedLead.quotation_locked === false ||
       unlockRequests.some(r => {
         const matchesLead = r.lead_id === selectedLead.lead_id || r.order_id === selectedLead.lead_id || r.project_id === selectedLead.lead_id;
         const matchesOrder = orders && orders.some(o => o.lead_id === selectedLead.lead_id && (o.order_id === r.order_id || o.order_id === r.lead_id));
         const matchesLeadOrderId = (selectedLead as any).order_id && (r.order_id === (selectedLead as any).order_id || r.lead_id === (selectedLead as any).order_id);
         const isApproved = r.status === 'Approved' || r.request_status === 'Approved';
         return (matchesLead || matchesOrder || matchesLeadOrderId) && isApproved;
       })) && selectedLead.quotation_locked !== true
    : false;

  // Event completion CRM lock logic
  const leadEventsForLockCheck = (crmEvents && crmEvents.length > 0)
    ? crmEvents
    : ((selectedLead?.events && selectedLead.events.length > 0)
        ? selectedLead.events
        : (selectedLead?.event_date ? [selectedLead] : []));

  const isMultiEventLead = Boolean(leadEventsForLockCheck && leadEventsForLockCheck.length > 1);
  const isCrmLocked = Boolean(selectedLead && checkIsLeadCrmLocked(selectedLead, leadEventsForLockCheck));
  const isLeadLocked = isCrmLocked;
  const isLeadLost = Boolean(
    selectedLead && ['Lost Lead', 'Lead Lost', 'Lost'].includes(
      selectedLead.status || (selectedLead as any).current_status || wizardLeadData.status || ''
    )
  );

  const isStep1Locked = isCrmLocked;
  const isStep2Locked = isCrmLocked;
  const isStep3Locked = isCrmLocked;

  const [openDropdownLeadId, setOpenDropdownLeadId] = useState<string | null>(null);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number | string, right: number | string, bottom: number | string }>({ top: 0, right: 0, bottom: 'auto' });

  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.actions-dropdown-container') && !target.closest('.actions-dropdown-menu')) {
        setOpenDropdownLeadId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Repeat Customer / Reorder System states
  const [detectedCustomer, setDetectedCustomer] = useState<any>(null);
  const [showDetectionPopup, setShowDetectionPopup] = useState(false);
  const [isQuickReorderView, setIsQuickReorderView] = useState(false);
  
  // Custom states for configuring quick reorder
  const [reorderForm, setReorderForm] = useState({
    event_type: '',
    custom_event_name: '',
    custom_event_type: '',
    event_date: '',
    event_time: '12:00',
    event_location: '',
    package_name: '',
    quotation_amount: 0,
    advance_received: 0,
  });

  // Customer Profiles sub-tab states
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState<string | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Filter & Collapse States
  const [filterQuery, setFilterQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [filterEventDateOption, setFilterEventDateOption] = useState<'all' | 'most_recent' | 'last_event' | ''>('');
  const [isDownloadReportsExpanded, setIsDownloadReportsExpanded] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSalesPerson, setFilterSalesPerson] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // Extra state for "Other" lead source name input
  const [otherSource, setOtherSource] = useState('');

  // Screen 2 Form State (Wizard support)
  const [createForm, setCreateForm] = useState<{
    customer_name: string;
    mobile: string;
    alternate_mobile: string;
    email: string;
    lead_source: string;
    event_type: string;
    custom_event_name: string;
    event_name: string;
    event_event_shoot_type: string;
    event_date: string;
    event_start_date: string;
    event_end_date: string;
    event_time: string;
    event_location: string;
    guest_pax: number | '';
    staff_pax: number | '';
    budget: number | '';
    remarks: string;
    whatsapp_number: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    client_residence_address: string;
    desired_event_shoot_type: string;
    selected_package_id: string;
    total_pax: number | '';
    reference_source: string;
    lead_value: number | '';
    lead_score: number | '';
    booking_status: string;
  }>({
    customer_name: '',
    mobile: '',
    alternate_mobile: '',
    email: '',
    lead_source: '',
    event_type: '',
    custom_event_name: '',
    event_name: '',
    event_event_shoot_type: '',
    event_date: '',
    event_start_date: '',
    event_end_date: '',
    event_time: '',
    event_location: '',
    guest_pax: "" as any,
    staff_pax: "" as any,
    budget: '',
    remarks: '',
    whatsapp_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    Specify_Custom_Lead_Source_Name: '',
    client_residence_address: '',
    desired_event_shoot_type: '',
    selected_package_id: '',
    total_pax: '',
    reference_source: '',
    lead_score: '',
    booking_status: '',
  });

  const [collapsedEventIds, setCollapsedEventIds] = useState<Record<string, boolean>>({});
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<Omit<LeadEvent, 'id'>>({
    event_type: '',
    event_name: '',
    event_event_shoot_type: '',
    event_date: '',
    event_start_time: '',
    event_end_time: '',
    event_location: '',
    google_maps_link: '',
    guest_pax: "" as any,
    staff_pax: "" as any,
    event_start_date: '',
    event_end_date: ''
  });

  const [wizardStep, setWizardStep] = useState(1);
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null);

  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateCustomerInfo, setDuplicateCustomerInfo] = useState<{
    customer_name: string;
    created_date: string;
    status: string;
    event_date: string;
  } | null>(null);
  const bypassDuplicateCheckRef = useRef(false);

  // Package customizations
  const [pkgPrices, setPkgPrices] = useState<Record<string, number>>({});
  const [pkgDeliverables, setPkgDeliverables] = useState<Record<string, string>>({});
  const [pkgNotes, setPkgNotes] = useState<Record<string, string>>({});

  // Additional form fields for Steps 4 & 5
  const [reportingTime, setReportingTime] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [salesStatus, setSalesStatus] = useState<string>('');

  // Order Confirmed Additional mandatory fields
  const [confirmedEventDate, setConfirmedEventDate] = useState('');
  const [confirmedEventTime, setConfirmedEventTime] = useState('');
  const [finalPackageAmount, setFinalPackageAmount] = useState<number | ''>('');
  const [advanceReceived, setAdvanceReceived] = useState<number | ''>('');

  const resetForm = () => {
    bypassDuplicateCheckRef.current = false;
    setCreateForm({
      customer_name: '',
      mobile: '',
      alternate_mobile: '',
      email: '',
      lead_source: '',
      event_type: '',
      custom_event_name: '',
      event_name: '',
      event_event_shoot_type: '',
      event_date: '',
      event_start_date: '',
      event_end_date: '',
      event_time: '',
      event_location: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      budget: '',
      remarks: '',
      whatsapp_number: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
    Specify_Custom_Lead_Source_Name: '',
      client_residence_address: '',
      desired_event_shoot_type: '',
      selected_package_id: '',
      total_pax: '',
      reference_source: '',
      lead_value: '',
      lead_score: '',
      booking_status: '',
    });
    setCreateEvents([]);
    setWizardLeadData({
      customer_name: '',
      mobile: '',
      whatsapp_number: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
    Specify_Custom_Lead_Source_Name: '',
      client_residence_address: '',
      desired_event_shoot_type: '',
      event_type: '',
      custom_event_name: '',
      event_name: '',
      event_event_shoot_type: '',
      event_date: '',
      event_start_date: '',
      event_end_date: '',
      event_time: '',
      reporting_time: '',
      event_location: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      lead_source: '',
      event_shoot_type: '',
      selected_package_id: '',
      package_cost: 0,
      deliverables: '',
      notes: '',
      budget: 0,
      final_quoted_amount: 0,
      remarks: '',
      next_follow_up_date: '',
      status: '' as CurrentStage,
      confirmed_event_date: '',
      confirmed_event_time: '',
      final_amount: 0,
      advance_received: 0,
      package_price: 0,
      deliverables_description: '',
      notes_special_customizations: '',
      quotation_discount: 0,
      additional_services_cost: 0,
      total_pax: 0,
      reference_source: '',
      lead_value: 0,
      lead_score: 0,
      booking_status: 'Pending',
    });
    setOtherSource('');
    setSelectedPkgIds([]);
    setLeadDiscount('');
    setIsPkgDropdownOpen(false);
    
    // Reset wizard fields
    setWizardStep(1);
    setCrmWizardStep(1);
    setCreatedLeadId(null);
    setPkgPrices({});
    setPkgDeliverables({});
    setPkgNotes({});
    setReportingTime('');
    setInternalNotes('');
    setFollowUpDate('');
    setSalesStatus('');
    setConfirmedEventDate('');
    setConfirmedEventTime('');
    setFinalPackageAmount('');
    setAdvanceReceived('');
    setQuoteDiscount('');
    setQuoteAdditional('');
    
    setFollowUpForm({
      status: '',
      quotation_amount: '',
      advance_received: '',
      call_notes: ''
    });
    setConfirmForm({
      package_name: '',
      quotation_amount: '',
      advance_received: '',
      event_date: '',
      event_time: ''
    });
    setEventForm({
      event_type: '',
      event_name: '',
      event_event_shoot_type: '',
      event_date: '',
      event_start_time: '',
      event_end_time: '',
      event_location: '',
      google_maps_link: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      event_start_date: '',
      event_end_date: ''
    });
    setShowEventForm(false);
    setEditingEventId(null);
    setCollapsedEventIds({});
    setShowConfirmModal(false);
    setGeneratedPDFBlobUrl('');
    setActiveQuoteNum('');
    setEditableInclusions({});
    setEditableDeliverables({});
    setQuoteServices([]);
    setEditingServiceId(null);
    setNewServiceName('');
    setNewServiceQty(1);
    setNewServicePrice(0);
    setIsAddingInline(false);
    setStatusError(null);
    setUnlockingRecordId(null);
    setPkgSearchQuery('');

    // Clear cached quote services
    localStorage.removeItem('erp_quote_services_create');
  };

  // Action hook to reset state, auto-scroll and auto-focus when transitioning to 'create' tab
  React.useEffect(() => {
    if (activeTab === 'create') {
      resetForm();

      setTimeout(() => {
        const titleEl = document.getElementById('create_lead_form_heading');
        if (titleEl) {
          titleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          const formEl = document.querySelector('form');
          if (formEl) {
            formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        const firstInput = document.querySelector('input[placeholder*="Enter customer name"]') as HTMLInputElement;
        if (firstInput) {
          firstInput.focus();
        }
      }, 150);
    }
  }, [activeTab]);

  // Packages creation hooks
  const [selectedPkgIds, setSelectedPkgIds] = useState<string[]>([]);
  const [leadDiscount, setLeadDiscount] = useState<number>(0);
  const [isPkgDropdownOpen, setIsPkgDropdownOpen] = useState(false);
  const [pkgSearchQuery, setPkgSearchQuery] = useState('');

  // Auto calculate and sync with createForm.budget
  const selectedPkgs = PACKAGES_LIST.flatMap(cat => cat.items).filter(item => selectedPkgIds.includes(item.id));
  
  // Package Selection Price is editable, so subtotal sums the edited prices
  const subtotal = selectedPkgs.reduce((sum, item) => sum + (pkgPrices[item.id] !== undefined ? pkgPrices[item.id] : item.cost), 0);
  const finalTotal = Math.max(0, subtotal - leadDiscount);

  // Sync package configurations on changes
  React.useEffect(() => {
    const allPkgs = PACKAGES_LIST.flatMap(cat => cat.items);
    const newPrices = { ...pkgPrices };
    const newDeliverables = { ...pkgDeliverables };
    const newNotes = { ...pkgNotes };
    let changed = false;

    selectedPkgIds.forEach(id => {
      const p = allPkgs.find(item => item.id === id);
      if (p) {
        if (newPrices[id] === undefined) {
          newPrices[id] = p.cost;
          changed = true;
        }
        if (newDeliverables[id] === undefined) {
          newDeliverables[id] = p.deliverables || 'N/A';
          changed = true;
        }
        if (newNotes[id] === undefined) {
          newNotes[id] = p.seasonal_offer !== 'None' ? `Offers: ${p.seasonal_offer}` : '';
          changed = true;
        }
      }
    });

    // Remove unselected package keys
    Object.keys(newPrices).forEach(id => {
      if (!selectedPkgIds.includes(id)) {
        delete newPrices[id];
        delete newDeliverables[id];
        delete newNotes[id];
        changed = true;
      }
    });

    if (changed) {
      setPkgPrices(newPrices);
      setPkgDeliverables(newDeliverables);
      setPkgNotes(newNotes);
    }
  }, [selectedPkgIds, PACKAGES_LIST]);

  React.useEffect(() => {
    // Only auto-override if packages are actively selected
    if (selectedPkgIds.length > 0) {
      setCreateForm(prev => ({
        ...prev,
        budget: finalTotal,
        selected_package_id: selectedPkgIds[0] || ''
      }));
    } else {
      setCreateForm(prev => ({
        ...prev,
        selected_package_id: ''
      }));
    }
  }, [finalTotal, selectedPkgIds]);

  // Body scroll lock effect when Create Lead modal is open (REMOVED to allow scrolling on smaller screens)
  React.useEffect(() => {
    // Body scroll lock removed to fix scrolling issues on smaller screens.
  }, [activeTab]);

  // Screen 3 Follow-Up Form State
  const [followUpForm, setFollowUpForm] = useState({
    call_notes: '',
    next_follow_up_date: '',
    status: 'Quote Follow-up' as CurrentStage,
    quotation_amount: 3500,
    negotiation_notes: '',
    event_date: '',
    event_time: '',
    reporting_time: '08:00',
    advance_received: 0,
    payment_mode: 'UPI',
    transaction_id: '',
  });

  // Confirm Order Form State & Auto-scroll Ref
  const confirmBookingModalRef = useRef<HTMLDivElement | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCustomerInfoExpanded, setIsCustomerInfoExpanded] = useState(true);

  // Manage scroll locking when Booking Confirmation modal is active
  useEffect(() => {
    if (showConfirmModal) {
      // Prevent background dashboard scrolling while modal is active
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showConfirmModal]);
  const [confirmForm, setConfirmForm] = useState<{
    package_name: string;
    quotation_amount: number;
    advance_received: number | string;
    event_date: string;
    event_time: string;
    payment_mode: string;
    notes: string;
    transaction_id: string;
  }>({
    package_name: '',
    quotation_amount: 0,
    advance_received: 0,
    event_date: '',
    event_time: '',
    payment_mode: 'UPI',
    notes: '',
    transaction_id: '',
  });

  // Final Reporting Details State per event
  const [eventsReporting, setEventsReporting] = useState<Record<string, { reporting_date: string, reporting_time: string }>>({});

  const initEventsReporting = (lead: Lead | null | undefined) => {
    if (!lead) return;
    const initialMap: Record<string, { reporting_date: string, reporting_time: string }> = {};
    const eventsList = sortEventsAscending(
      (crmEvents && Array.isArray(crmEvents) && crmEvents.length > 0 && selectedLead?.lead_id === lead.lead_id)
        ? crmEvents
        : (lead.events || [])
    );
    if (eventsList && Array.isArray(eventsList) && eventsList.length > 0) {
      eventsList.forEach((ev, idx) => {
        const key = ev.id || `ev_${idx}`;
        initialMap[key] = {
          reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || lead.Reporting_date || (lead as any).reporting_date || lead.event_date || '',
          reporting_time: ev.reporting_time || lead.reporting_time || ''
        };
      });
    } else {
      initialMap['default'] = {
        reporting_date: lead.Reporting_date || (lead as any).reporting_date || lead.event_date || '',
        reporting_time: lead.reporting_time || ''
      };
    }
    setEventsReporting(initialMap);
  };

  const [showFinalReportingModal, setShowFinalReportingModal] = useState(false);
  const [finalReportingForm, setFinalReportingForm] = useState<Record<string, { reporting_date: string, reporting_time: string }>>({});

  const areReportingDetailsComplete = (lead: Lead | null | undefined): boolean => {
    if (!lead) return false;

    if (lead.events && Array.isArray(lead.events) && lead.events.length > 0) {
      return lead.events.every((ev) => {
        const rDate = ev.reporting_date || (ev as any).Reporting_date;
        const rTime = ev.reporting_time;
        return typeof rDate === 'string' && rDate.trim() !== '' && typeof rTime === 'string' && rTime.trim() !== '';
      });
    }

    const leadRDate = lead.Reporting_date || (lead as any).reporting_date;
    const leadRTime = lead.reporting_time;
    return typeof leadRDate === 'string' && leadRDate.trim() !== '' && typeof leadRTime === 'string' && leadRTime.trim() !== '';
  };

  const openReportingDetailsModal = (lead: Lead, customMsg?: string) => {
    setSelectedLead(lead);
    const crmEvents = lead.events || [];
    const initialFormState: Record<string, { reporting_date: string, reporting_time: string }> = {};

    if (crmEvents.length > 0) {
      crmEvents.forEach((ev) => {
        initialFormState[ev.id] = {
          reporting_date: ev.reporting_date || ev.event_date || lead.Reporting_date || lead.event_date || '',
          reporting_time: ev.reporting_time || lead.reporting_time || ''
        };
      });
    } else {
      initialFormState['default'] = {
        reporting_date: lead.Reporting_date || (lead as any).reporting_date || lead.event_date || '',
        reporting_time: lead.reporting_time || ''
      };
    }

    setFinalReportingForm(initialFormState);
    setShowFinalReportingModal(true);
    showToastMsg(customMsg || "Please complete and save the Reporting Details before confirming the order.", "error");
  };

  // Quotation System State
  const [quotationTerms, setQuotationTerms] = useState(
    "1. Payments are non-refundable.\n" +
    "2. Crew food arrangements from client side.\n" +
    "3. 50% advance payment before the event.\n" +
    "4. If duration exceeds 1 hour, additional charges of ₹1,500 per hour will be applicable.\n" +
    "5. 50% full payment on event day.\n" +
    "6. Pendrive and Hard Disk are not included.\n" +
    "7. Edited data will be shared via Google Drive link."
  );
  const [generatedPDFBlobUrl, setGeneratedPDFBlobUrl] = useState<string>('');
  const [activeQuoteNum, setActiveQuoteNum] = useState<string>('');
  const [showStep3Popup, setShowStep3Popup] = useState<boolean>(false);
  const [step3Option, setStep3Option] = useState<'negotiation' | 'quotation_send'>('negotiation');

  // Customizable inclusions, deliverables, discount, and additional charges states
  const [editableInclusions, setEditableInclusions] = useState<Record<string, string[]>>({});
  const [editableDeliverables, setEditableDeliverables] = useState<Record<string, string[]>>({});
  
  const [step3AutoSaveStatus, setStep3AutoSaveStatus] = useState<'saving' | 'saved' | 'error' | null>(null);

  const step3SaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveStep3DataRealtime = async (
    updatedInclusions: Record<string, string[]>,
    updatedDeliverables: Record<string, string[]>,
    activePkgId?: string,
    packageCostOverride?: number | null,
    discountOverride?: number | null,
    additionalOverride?: number | null
  ) => {
    if (isStep3Locked) return;
    const pkgId = activePkgId || wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedPkgIds[0] || 'Custom Package';
    const leadId = selectedLead?.lead_id || createdLeadId;
    if (!leadId || leadId === 'DRAFT-LEAD' || !pkgId || !supabaseClient) return;

    setStep3AutoSaveStatus('saving');

    const activeEventsList = (activeTab === 'create' && createEvents.length > 0) ? createEvents : (crmEvents && crmEvents.length > 0 ? crmEvents : []);
    const { teamMembersJson, deliverablesJson, flatTeamMembers, teamMembersText, deliverablesText } = buildStep3EventPayloads(
      pkgId,
      activeEventsList,
      updatedInclusions,
      updatedDeliverables
    );

    const safeTeamMembersText = teamMembersText;
    const safeDeliverablesText = deliverablesText;

    console.log('TEAM MEMBERS SAVE', { leadId, teamMembers: flatTeamMembers, serialized: safeTeamMembersText });

    const cleanPkgCost = packageCostOverride !== undefined ? packageCostOverride : (
      wizardLeadData.package_cost !== "" && wizardLeadData.package_cost != null && !isNaN(Number(wizardLeadData.package_cost))
      ? Number(wizardLeadData.package_cost)
      : (wizardLeadData.package_price !== "" && wizardLeadData.package_price != null && !isNaN(Number(wizardLeadData.package_price))
        ? Number(wizardLeadData.package_price)
        : (wizardLeadData.budget ? Number(wizardLeadData.budget) : null))
    );

    const cleanDiscount = discountOverride !== undefined ? (discountOverride || 0) : (
      quoteDiscount === "" || quoteDiscount == null || isNaN(Number(quoteDiscount)) ? 0 : Number(quoteDiscount)
    );
    const cleanAdditional = additionalOverride !== undefined ? (additionalOverride || 0) : (
      quoteAdditional === "" || quoteAdditional == null || isNaN(Number(quoteAdditional)) ? 0 : Number(quoteAdditional)
    );
    const cleanFinalAmt = Math.max(0, (cleanPkgCost || 0) + cleanAdditional - cleanDiscount);

    const updatedEventsWithData = activeEventsList.map((ev, idx) => {
      const evId = String(ev.id || ev.event_id || `EV-${idx + 1}`);
      const evTmObj = teamMembersJson.find(t => String(t.event_id) === evId);
      const evDelObj = deliverablesJson.find(d => String(d.event_id) === evId);
      const evTm = evTmObj?.team_members || [];
      const evDel = evDelObj?.deliverables || [];
      return {
        ...ev,
        team_members: evTm,
        deliverables: evDel,
        inclusions: evTm,
        Team_Members: JSON.stringify(evTm),
        Add_Deliverable: JSON.stringify(evDel)
      };
    });

    const updatePayload: any = {
      Team_Members: safeTeamMembersText,
      Add_Deliverable: safeDeliverablesText,
      Select_Package_Option: pkgId,
      Quotation_Discount: cleanDiscount,
      Additional_Services_Cost: cleanAdditional,
      Final_Quotation_Amount: cleanFinalAmt,
      Final_Package_Amount: cleanFinalAmt,
      final_package_amount: cleanFinalAmt,
      ...(updatedEventsWithData.length > 0 ? { events: updatedEventsWithData } : {}),
      _explicit_step3_save: true
    };

    if (cleanPkgCost !== null && cleanPkgCost !== undefined) {
      updatePayload.package_price = cleanPkgCost;
      updatePayload.budget = cleanPkgCost;
    }

    if (step3SaveTimeoutRef.current) {
      clearTimeout(step3SaveTimeoutRef.current);
    }

    step3SaveTimeoutRef.current = setTimeout(async () => {
      try {
        // 1. Direct Supabase update to ensure public.leads has latest Package Base Price and Final Amounts
        const { error: dbError } = await supabaseClient
          .from('leads')
          .update({
            Team_Members: safeTeamMembersText,
            Add_Deliverable: safeDeliverablesText,
            Select_Package_Option: pkgId,
            Quotation_Discount: cleanDiscount,
            Additional_Services_Cost: cleanAdditional,
            Final_Quotation_Amount: cleanFinalAmt,
            Final_Package_Amount: cleanFinalAmt,
            final_package_amount: cleanFinalAmt,
            package_price: cleanPkgCost,
            budget: cleanPkgCost,
            ...(updatedEventsWithData.length > 0 ? { events: updatedEventsWithData } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('lead_id', leadId);

        if (dbError) {
          console.error("Direct Supabase update error on leads:", dbError);
          setStep3AutoSaveStatus('error');
          return;
        }

        // 2. Also save / update lead_packages record in Supabase
        try {
          const isValidPackage = INITIAL_PACKAGES.some(p => p.package_id === pkgId);
          if (!isValidPackage) {
            console.warn(`[useSalesDashboardState] Skipping lead_packages upsert for invalid package_id: ${pkgId}`);
            throw new Error(`Invalid package_id: ${pkgId}`);
          }
          const rawPackagePayload = {
            lead_id: leadId,
            package_id: pkgId,
            package_name: wizardLeadData.package_name || (pkgId === 'Custom Package' || pkgId === 'custom_package' ? 'Custom Package' : `Package ${pkgId}`),
            quantity: 1,
            package_cost: cleanPkgCost || 0,
            total_amount: cleanPkgCost || 0,
            discount: cleanDiscount || 0,
            additional_services_cost: cleanAdditional || 0,
            final_amount: cleanFinalAmt,
            Team_Members_Included: teamMembersJson,
            editable_inclusions: updatedInclusions,
            deliverables_descriptionn: deliverablesJson,
            deliverables_description: deliverablesText,
            editable_deliverables: updatedDeliverables,
            updated_at: new Date().toISOString()
          };

          const { payload: packagePayload, isValid, teamMembersValid, deliverablesValid, issues } = verifyAndFormatLeadPackagePayload(
            rawPackagePayload,
            'saveStep3DataRealtime [Realtime Step 3 Auto-Save]'
          );

          const { data: existingLps, error: fetchLpErr } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', leadId);

          if (fetchLpErr) {
            console.warn("[lead_packages realtime] Error querying existing lead_packages:", fetchLpErr);
          }
          
          let targetLpId = `LP-${leadId}-${pkgId}`;
          
          if (existingLps && existingLps.length > 0) {
            const matched = existingLps.find(lp => String(lp.package_id) === String(pkgId)) || existingLps[0];
            targetLpId = matched.lead_package_id || matched.id || targetLpId;
            console.log(`🚀 [Supabase API Call] Realtime updating 'lead_packages' (ID: "${targetLpId}"):`, packagePayload);
            const { data: updateRes, error: updateErr } = await supabaseClient
              .from('lead_packages')
              .update(packagePayload)
              .eq(matched.lead_package_id ? 'lead_package_id' : 'id', targetLpId)
              .select('*');

            if (updateErr) {
              console.error(`❌ [Supabase API Error] Realtime error updating 'lead_packages':`, updateErr);
            } else {
              console.log(`✅ [Supabase API Success] Realtime updated 'lead_packages' record:`, updateRes);
            }
          } else {
            console.log(`🚀 [Supabase API Call] Realtime inserting 'lead_packages' (ID: "${targetLpId}"):`, packagePayload);
            const { data: insertRes, error: insertErr } = await supabaseClient
              .from('lead_packages')
              .insert({
                ...packagePayload,
                lead_package_id: targetLpId,
                created_at: new Date().toISOString()
              })
              .select('*');

            if (insertErr) {
              console.error(`❌ [Supabase API Error] Realtime error inserting 'lead_packages':`, insertErr);
            } else {
              console.log(`✅ [Supabase API Success] Realtime inserted 'lead_packages' record:`, insertRes);
            }
          }
        } catch (lpErr) {
          console.warn("Could not update lead_packages in saveStep3DataRealtime:", lpErr);
        }

        // 3. Synchronize quotations table in Supabase
        try {
          const { data: existingQuotes } = await supabaseClient
            .from('quotations')
            .select('quotation_id')
            .eq('lead_id', leadId);
          if (existingQuotes && existingQuotes.length > 0) {
            for (const q of existingQuotes) {
              await supabaseClient
                .from('quotations')
                .update({
                  package_price: cleanPkgCost,
                  quotation_amount: cleanFinalAmt,
                  final_amount: cleanFinalAmt,
                  discount_amount: cleanDiscount,
                  additional_services_cost: cleanAdditional,
                  updated_at: new Date().toISOString()
                })
                .eq('quotation_id', q.quotation_id);
            }
          }
        } catch (qErr) {
          console.warn("Could not sync quotations table:", qErr);
        }

        // 4. Synchronize orders and payments tables in Supabase for confirmed orders
        try {
          const { data: linkedOrders } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('lead_id', leadId);

          if (linkedOrders && linkedOrders.length > 0) {
            for (const ord of linkedOrders) {
              const adv = Number(ord.advance_received || 0);
              const newBalance = Math.max(0, cleanFinalAmt - adv);
              await supabaseClient
                .from('orders')
                .update({
                  package_price: cleanPkgCost,
                  quotation_amount: cleanFinalAmt,
                  final_amount: cleanFinalAmt,
                  quotation_discount: cleanDiscount,
                  additional_services_cost: cleanAdditional,
                  balance_amount: newBalance,
                  updated_at: new Date().toISOString()
                })
                .eq('order_id', ord.order_id);

              // 5. Synchronize payments table without altering historical payment records
              const { data: linkedPayments } = await supabaseClient
                .from('payments')
                .select('*')
                .eq('order_id', ord.order_id);

              if (linkedPayments && linkedPayments.length > 0) {
                for (const pay of linkedPayments) {
                  const actualPaid = (Number(pay.advance_received) || 0) + (Number(pay.final_payment_received) || 0) + (Number(pay.additional_received) || 0);
                  const newBalanceDue = Math.max(0, cleanFinalAmt - actualPaid);
                  const newStatus = (pay.payment_status === 'Waiting for Approval')
                    ? 'Waiting for Approval'
                    : (newBalanceDue <= 0 && cleanFinalAmt > 0) 
                      ? 'Fully Paid' 
                      : (actualPaid > 0 ? 'Partially Paid' : (pay.payment_status || 'Pending'));

                  await supabaseClient
                    .from('payments')
                    .update({
                      quotation_amount: cleanFinalAmt,
                      balance_due: newBalanceDue,
                      payment_status: newStatus,
                      updated_at: new Date().toISOString()
                    })
                    .eq('payment_id', pay.payment_id);
                }
              }
            }
          }
        } catch (ordErr) {
          console.warn("Could not sync orders/payments in saveStep3DataRealtime:", ordErr);
        }

        // 6. Database Source of Truth: Re-fetch and verify the actual saved record from Supabase
        const { data: verifiedLead, error: verifyErr } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', leadId)
          .single();

        if (verifyErr || !verifiedLead) {
          throw new Error(verifyErr?.message || "Failed to verify saved record from database.");
        }

        const verifiedPkgPrice = Number(verifiedLead.package_price ?? cleanPkgCost);
        const verifiedDiscount = Number(verifiedLead.Quotation_Discount ?? cleanDiscount);
        const verifiedAdditional = Number(verifiedLead.Additional_Services_Cost ?? cleanAdditional);
        const verifiedFinalAmt = Math.max(0, verifiedPkgPrice - verifiedDiscount + verifiedAdditional);

        // Update local context manually to ensure instant visual sync
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            ...verifiedLead,
            Team_member: safeTeamMembersText,
            Team_Members: safeTeamMembersText,
            team_members: safeTeamMembersText,
            Add_Deliverable: safeDeliverablesText,
            deliverables_description: safeDeliverablesText,
            selected_package_id: pkgId,
            Quotation_Discount: verifiedDiscount,
            Additional_Services_Cost: verifiedAdditional,
            Final_Quotation_Amount: verifiedFinalAmt,
            Final_Package_Amount: verifiedFinalAmt,
            final_package_amount: verifiedFinalAmt,
            package_price: verifiedPkgPrice,
            budget: verifiedPkgPrice,
            events: updatedEventsWithData.length > 0 ? updatedEventsWithData : prev.events
          };
        });

        // Also sync wizardLeadData deliverables and team members state
        setWizardLeadData(prev => ({
          ...prev,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          team_members: safeTeamMembersText,
          Add_Deliverable: safeDeliverablesText,
          deliverables: deliverablesText,
          deliverables_description: deliverablesText,
          selected_package_id: pkgId,
          package_cost: verifiedPkgPrice,
          package_price: verifiedPkgPrice,
          budget: verifiedPkgPrice,
          final_amount: verifiedFinalAmt,
          final_quoted_amount: verifiedFinalAmt
        }));

        // Invalidate stale cached quote services in localStorage
        try {
          localStorage.removeItem(`erp_quote_services_${leadId}`);
        } catch (e) {}

        // Global refresh to ensure all dashboards, pending payments, and revenue reports are synchronized
        if (refreshData) {
          await refreshData();
        }

        setStep3AutoSaveStatus('saved');
      } catch (err) {
        console.error("Exception in saveStep3DataRealtime:", err);
        setStep3AutoSaveStatus('error');
      }
    }, 400);
  };

  const getCleanSalesStaffName = (rawName?: any, leadObj?: Lead | null): string => {
    let candidate = String(rawName || '').trim();

    if (!candidate && leadObj) {
      if (leadObj.sales_staff_name && String(leadObj.sales_staff_name).trim()) {
        candidate = String(leadObj.sales_staff_name).trim();
      } else if (leadObj.sales_person && !['Sales', 'Sales Team', 'Admin', 'Admin User'].includes(String(leadObj.sales_person).trim())) {
        candidate = String(leadObj.sales_person).trim();
      }
    }

    if (!candidate && currentUser?.name) {
      candidate = currentUser.name;
    }

    if (!candidate) return '';

    // If candidate contains comma-separated names, extract only the actual Sales Person
    if (candidate.includes(',')) {
      if (leadObj?.sales_person && !['Sales', 'Sales Team', 'Admin', 'Admin User'].includes(String(leadObj.sales_person).trim())) {
        const sp = String(leadObj.sales_person).trim().toLowerCase();
        const parts = candidate.split(',').map(s => s.trim());
        const match = parts.find(p => p.toLowerCase() === sp || p.toLowerCase().includes(sp) || sp.includes(p.toLowerCase()));
        if (match) return match;
      }
      return candidate.split(',')[0].trim();
    }

    return candidate;
  };

  const getCleanSalesStaffMobile = (rawMobile?: any, leadObj?: Lead | null): string => {
    let candidate = String(rawMobile || '').trim();

    if (!candidate && leadObj && leadObj.sales_staff_mobile && String(leadObj.sales_staff_mobile).trim()) {
      candidate = String(leadObj.sales_staff_mobile).trim();
    }

    if (!candidate && currentUser?.mobile) {
      candidate = currentUser.mobile || '';
    }

    if (!candidate) return '';

    if (candidate.includes('||')) {
      candidate = candidate.split('||')[0].trim();
    }
    if (candidate.includes(',')) {
      candidate = candidate.split(',')[0].trim();
    }

    return candidate;
  };

  const [salesStaffName, setSalesStaffName] = useState<string>('');
  const [salesStaffMobile, setSalesStaffMobile] = useState<string>('');

  const getEffectiveSalesStaffName = (): string => {
    if (salesStaffName && String(salesStaffName).trim()) {
      return String(salesStaffName).trim();
    }
    if (currentUser?.name && String(currentUser.name).trim()) {
      return String(currentUser.name).trim();
    }
    if (selectedLead?.sales_staff_name && String(selectedLead.sales_staff_name).trim()) {
      return String(selectedLead.sales_staff_name).trim();
    }
    return 'Sales Staff';
  };

  const getEffectiveSalesStaffMobile = (): string => {
    let raw = '';
    if (salesStaffMobile && String(salesStaffMobile).trim()) {
      raw = String(salesStaffMobile).trim();
    } else if (currentUser?.mobile && String(currentUser.mobile).trim()) {
      raw = String(currentUser.mobile).trim();
    } else if (selectedLead?.sales_staff_mobile && String(selectedLead.sales_staff_mobile).trim()) {
      raw = String(selectedLead.sales_staff_mobile).trim();
    }
    const digits = raw.replace(/\D/g, '');
    return digits || raw;
  };

  React.useEffect(() => {
    if (currentUser?.name && (!salesStaffName || !salesStaffName.trim())) {
      setSalesStaffName(currentUser.name);
    }
    if (currentUser?.mobile && (!salesStaffMobile || !salesStaffMobile.trim())) {
      setSalesStaffMobile(currentUser.mobile);
    }
  }, [currentUser]);
  const [quoteDiscount, setQuoteDiscount] = useState<number | ''>('');
  const [quoteAdditional, setQuoteAdditional] = useState<number | ''>('');
  
  const [quoteServices, setQuoteServices] = useState<{ id: string; name: string; qty: number; price: number; isAdditional?: boolean }[]>([]);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  
  // Adding service inline temp states
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceQty, setNewServiceQty] = useState(1);
  const [newServicePrice, setNewServicePrice] = useState(0);
  const [isAddingInline, setIsAddingInline] = useState(false);

  const handleAddInlineService = () => {
    if (!newServiceName.trim()) return;
    const newService = {
      id: `add_${Date.now()}`,
      name: newServiceName.trim(),
      qty: Math.max(1, newServiceQty),
      price: Math.max(0, newServicePrice),
      isAdditional: true
    };
    setQuoteServices(prev => [...prev, newService]);
    // reset states
    setNewServiceName('');
    setNewServiceQty(1);
    setNewServicePrice(0);
    setIsAddingInline(false);
  };

  const handleEditServiceItem = (id: string, updatedFields: Partial<{ name: string; qty: number; price: number }>) => {
    setQuoteServices(prev => prev.map(s => s.id === id ? { ...s, ...updatedFields } : s));
  };

  const handleRemoveServiceItem = (id: string) => {
    setQuoteServices(prev => prev.filter(s => s.id !== id));
  };

  
  // Synchronize/initialize services on entering Step 4
  React.useEffect(() => {
    const isStep4Active = wizardStep === 3 || crmWizardStep === 3;
    if (!isStep4Active) {
      setEditingServiceId(null);
      setIsAddingInline(false);
      return;
    }

    const activePkgs = getSelectedPkgsInfo(crmWizardStep === 3);
    const activePkgIds = activePkgs.map(lp => lp.package_id).filter(Boolean);

    // Build expected list of base deliverables from active packages directly from packages table
    const expectedBaseDeliverables: { pkgId: string; name: string }[] = [];
    activePkgs.forEach((lp) => {
      const pkgKey = lp.package_id || 'default';
      const pObj = (packages || []).find(p => p.package_id === lp.package_id);
      const incStr = pObj?.team_members || '';
      const delStr = pObj?.deliverables || '';

      const inclusionsList = parseTeamMembers(incStr);
      const deliverablesList = delStr
        ? delStr.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      const combined = [...inclusionsList, ...deliverablesList];
      if (combined.length === 0) {
        const defaultItems = [
          '2 Photographers',
          '1 Cinematographer',
          'Drone Coverage',
          'LED Wall',
          'Album (40 Sheets)',
          'Teaser Video',
          'Highlight Video',
          'Full Event Coverage'
        ];
        defaultItems.forEach(name => {
          expectedBaseDeliverables.push({ pkgId: pkgKey, name });
        });
      } else {
        combined.forEach(name => {
          expectedBaseDeliverables.push({ pkgId: pkgKey, name });
        });
      }
    });

    const leadId = crmWizardStep === 3 ? (selectedLead?.lead_id || 'edit') : (createdLeadId || 'create');
    const storageKey = `erp_quote_services_${leadId}`;
    const cached = localStorage.getItem(storageKey);
    let cacheIsValid = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          const cachedBaseServices = parsed.filter(s => !s.isAdditional && s.id.startsWith('base_'));
          
          if (cachedBaseServices.length === expectedBaseDeliverables.length) {
            const allMatched = expectedBaseDeliverables.every((expected) => {
              return cachedBaseServices.some(s => {
                const parts = s.id.split('_');
                const pkgIdPart = parts[1];
                return pkgIdPart === expected.pkgId && s.name === expected.name;
              });
            });
            if (allMatched) {
              cacheIsValid = true;
              setQuoteServices(parsed);
              return;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse cached quote services", e);
      }
    }

    // Fallback/Rebuild: auto-initialize directly using data from packages table
    const initialServices: { id: string; name: string; qty: number; price: number; isAdditional: boolean }[] = [];
    activePkgs.forEach((lp) => {
      const pkgKey = lp.package_id || 'default';
      const pObj = (packages || []).find(p => p.package_id === lp.package_id);
      const incStr = pObj?.team_members || '';
      const delStr = pObj?.deliverables || '';

      const inclusionsList = parseTeamMembers(incStr);
      const deliverablesList = delStr
        ? delStr.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      const combined = [...inclusionsList, ...deliverablesList];

      if (combined.length === 0) {
        // Fallback standard photography inclusions
        const defaultItems = [
          '2 Photographers',
          '1 Cinematographer',
          'Drone Coverage',
          'LED Wall',
          'Album (40 Sheets)',
          'Teaser Video',
          'Highlight Video',
          'Full Event Coverage'
        ];
        const defaultPrices = [20000, 15000, 10000, 10050, 8000, 7000, 5000, 5000];
        const sumDefault = defaultPrices.reduce((a, b) => a + b, 0);
        const totalCost = Number(lp.package_cost || 0);
        const ratio = totalCost ? (totalCost / sumDefault) : 1;

        let distributed = 0;
        defaultItems.forEach((name, idx) => {
          let pricePerItem;
          if (idx === defaultItems.length - 1) {
            pricePerItem = totalCost - distributed;
          } else {
            pricePerItem = Math.round((defaultPrices[idx] || 5000) * ratio);
            distributed += pricePerItem;
          }
          initialServices.push({
            id: `base_${pkgKey}_${idx}`,
            name,
            qty: 1,
            price: pricePerItem,
            isAdditional: false
          });
        });
      } else {
        // Divide lp.package_cost equally among combined items
        const count = combined.length;
        const totalCost = Number(lp.package_cost || 0);
        let distributed = 0;
        combined.forEach((name, idx) => {
          let pricePerItem;
          if (idx === count - 1) {
            pricePerItem = totalCost - distributed;
          } else {
            pricePerItem = Math.round(totalCost / count);
            distributed += pricePerItem;
          }
          initialServices.push({
            id: `base_${pkgKey}_${idx}`,
            name,
            qty: 1,
            price: pricePerItem,
            isAdditional: false
          });
        });
      }
    });

    setQuoteServices(initialServices);
  }, [wizardStep, crmWizardStep, selectedLead, createdLeadId, packages, wizardLeadData.selected_package_id, selectedPkgIds]);

  // Save services to local storage whenever they change
  React.useEffect(() => {
    const isStep4Active = wizardStep === 3 || crmWizardStep === 3;
    if (!isStep4Active) return;
    const leadId = crmWizardStep === 3 ? (selectedLead?.lead_id || 'edit') : (createdLeadId || 'create');
    localStorage.setItem(`erp_quote_services_${leadId}`, JSON.stringify(quoteServices));
  }, [quoteServices, selectedLead, createdLeadId, crmWizardStep, wizardStep]);

  const handleEditInclusion = (pkgKey: string, index: number, value: string) => {
    if (isStep3Locked) return;
    setEditableInclusions(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list[index] = value;
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleRemoveInclusion = (pkgKey: string, index: number) => {
    if (isStep3Locked) return;
    setEditableInclusions(prev => {
      const list = prev[pkgKey] ? prev[pkgKey].filter((_, i) => i !== index) : [];
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleAddInclusion = (pkgKey: string, value: string) => {
    if (isStep3Locked) return;
    if (!value.trim()) return;
    setEditableInclusions(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list.push(value.trim());
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleEditDeliverable = (pkgKey: string, index: number, value: string) => {
    if (isStep3Locked) return;
    setEditableDeliverables(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list[index] = value;
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleRemoveDeliverable = (pkgKey: string, index: number) => {
    if (isStep3Locked) return;
    setEditableDeliverables(prev => {
      const list = prev[pkgKey] ? prev[pkgKey].filter((_, i) => i !== index) : [];
      return { ...prev, [pkgKey]: list };
    });
  };

  const handleAddDeliverable = (pkgKey: string, value: string) => {
    if (isStep3Locked) return;
    if (!value.trim()) return;
    setEditableDeliverables(prev => {
      const list = prev[pkgKey] ? [...prev[pkgKey]] : [];
      list.push(value.trim());
      return { ...prev, [pkgKey]: list };
    });
  };

  // Reset or clear state when selectedLead changes or is deselected
  React.useEffect(() => {
    if (!selectedLead && activeTab === 'create') {
      return;
    }
    if (!selectedLead) {
      setEditableInclusions({});
      setEditableDeliverables({});
      return;
    }
  }, [selectedLead, activeTab]);

  const lastLoadedLeadIdRef = React.useRef<string | null>(null);

  // Fetch from Supabase directly for the JSON columns
  React.useEffect(() => {
    const pkgId = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id;
    const targetLeadId = selectedLead?.lead_id || (activeTab === 'create' ? createdLeadId : null);
    if (targetLeadId && targetLeadId !== 'DRAFT-LEAD' && supabaseClient) {
      const currentKey = `${targetLeadId}`;
      if (lastLoadedLeadIdRef.current === currentKey) {
        return;
      }
      const fetchSupabasePackageData = async () => {
        try {
          const { data: lpData } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', targetLeadId);

          const { data, error } = await supabaseClient
            .from('leads')
            .select('*')
            .eq('lead_id', targetLeadId)
            .maybeSingle();
          
          if (!error && (data || (lpData && lpData.length > 0))) {
            lastLoadedLeadIdRef.current = currentKey;
            
            const primaryLp = lpData && lpData.length > 0 ? lpData[0] : null;
            const effectivePkgId = pkgId || data?.Select_Package_Option || primaryLp?.package_id || 'Custom Package';
            const currentEvents = (activeTab === 'create' && createEvents.length > 0) ? createEvents : (crmEvents && crmEvents.length > 0 ? crmEvents : (data?.events || selectedLead?.events || []));

            const cleanCost = primaryLp?.package_cost ?? data?.package_price ?? data?.budget;
            if (cleanCost != null && !isNaN(Number(cleanCost))) {
              setWizardLeadData(prev => {
                const existingPkg = prev.selected_package_id || prev.Select_Package_Option;
                const finalPkg = (existingPkg && existingPkg.trim() !== '') ? existingPkg : effectivePkgId;
                return {
                  ...prev,
                  package_cost: Number(cleanCost),
                  package_price: Number(cleanCost),
                  budget: Number(cleanCost),
                  notes: data?.notes_special_customizations ?? prev.notes,
                  selected_package_id: finalPkg,
                };
              });
            }
            if (data?.Quotation_Discount != null) {
              setQuoteDiscount(Number(data.Quotation_Discount));
            }
            if (data?.Additional_Services_Cost != null) {
              setQuoteAdditional(Number(data.Additional_Services_Cost));
            }

            const rawTeamData = data?.Team_Members || data?.Team_member || (data as any)?.team_members || primaryLp?.Team_Members_Included || primaryLp?.editable_inclusions;
            console.log('TEAM MEMBERS LOADED', { leadId: targetLeadId, Team_Members: rawTeamData });
            if (rawTeamData) {
              const loadedInclusions = parseTeamMembersJsonToRecord(rawTeamData, effectivePkgId, currentEvents);
              if (Object.keys(loadedInclusions).length > 0) {
                setEditableInclusions(loadedInclusions);
              }
            }

            const rawDelData = data?.Add_Deliverable || primaryLp?.deliverables_descriptionn || primaryLp?.editable_deliverables || data?.deliverables_description;
            console.log('DELIVERABLES LOADED', { leadId: targetLeadId, Add_Deliverable: rawDelData });
            if (rawDelData) {
              const loadedDeliverables = parseDeliverablesJsonToRecord(rawDelData, effectivePkgId, currentEvents);
              if (Object.keys(loadedDeliverables).length > 0) {
                setEditableDeliverables(loadedDeliverables);
              }
            }
          }
        } catch (e) {
          console.error('Error fetching leads/lead_packages details from Supabase', e);
        }
      };
      fetchSupabasePackageData();
    } else {
      if (!selectedLead && !createdLeadId) {
        lastLoadedLeadIdRef.current = null;
      }
    }
  }, [selectedLead?.lead_id, createdLeadId, activeTab, wizardLeadData.selected_package_id, wizardLeadData.selected_package_id, supabaseClient, crmEvents, createEvents, crmWizardStep, wizardStep]);

  // Save to Supabase directly for the JSON columns
  const isFirstRender = React.useRef(true);
  
  // Explicit saves are now handled directly in the onChange handlers for immediate persistence
  // to avoid closure stale state overwrites in debounced effects.

  // Step 1 Automatic Data Prefill & Hydration from Supabase leads table
  React.useEffect(() => {
    if (!selectedLead?.lead_id || !supabaseClient || selectedLead.lead_id === 'DRAFT-LEAD') return;

    let isMounted = true;

    const loadStep1DataFromDB = async () => {
      try {
        const { data: dbLead, error } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', selectedLead.lead_id)
          .maybeSingle();

        if (error || !dbLead || !isMounted) return;

        setWizardLeadData(prev => ({
          ...prev,
          customer_name: dbLead.customer_name || prev.customer_name || '',
          mobile: dbLead.mobile ? String(dbLead.mobile) : (prev.mobile ? String(prev.mobile) : ''),
          whatsapp_number: dbLead.whatsapp_number ? String(dbLead.whatsapp_number) : (dbLead.mobile ? String(dbLead.mobile) : (prev.whatsapp_number ? String(prev.whatsapp_number) : '')),
          email: dbLead.email ?? prev.email ?? '',
          lead_source: dbLead.lead_source || prev.lead_source || '',
          Specify_Custom_Lead_Source_Name: dbLead.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name || '',
          address: dbLead.address || prev.address || '',
          city: dbLead.city || prev.city || '',
          state: dbLead.state || prev.state || '',
          pincode: dbLead.pincode || prev.pincode || '',
          client_residence_address: dbLead.client_residence_address || prev.client_residence_address || '',
          desired_event_shoot_type: dbLead.desired_event_shoot_type || prev.desired_event_shoot_type || '',
          status: dbLead.status || dbLead.current_status || prev.status,
          budget: dbLead.budget ?? prev.budget ?? 0,
          package_price: dbLead.package_price ?? prev.package_price ?? 0,
          selected_package_id: prev.selected_package_id || dbLead.Select_Package_Option || '',
        }));

        // Keep selectedLead object in sync with fresh database values
        setSelectedLead(prev => {
          if (!prev || prev.lead_id !== dbLead.lead_id) return prev;
          return {
            ...prev,
            customer_name: dbLead.customer_name || prev.customer_name,
            mobile: dbLead.mobile ? String(dbLead.mobile) : prev.mobile,
            whatsapp_number: dbLead.whatsapp_number ? String(dbLead.whatsapp_number) : prev.whatsapp_number,
            email: dbLead.email ?? prev.email,
            lead_source: dbLead.lead_source || prev.lead_source,
            Specify_Custom_Lead_Source_Name: dbLead.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name,
            status: dbLead.status || dbLead.current_status || prev.status,
          };
        });
      } catch (err) {
        console.error("Error loading Step 1 data from DB:", err);
      }
    };

    loadStep1DataFromDB();

    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, supabaseClient]);

  // Step 1 Customer Details Automatic Data Hydration from Supabase
  React.useEffect(() => {
    if (!selectedLead?.lead_id || selectedLead.lead_id === 'DRAFT-LEAD' || !supabaseClient) return;

    let isMounted = true;

    const hydrateCustomerDetails = async () => {
      try {
        const { data: leadData, error } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', selectedLead.lead_id)
          .maybeSingle();

        if (error || !leadData || !isMounted) return;

        setWizardLeadData(prev => ({
          ...prev,
          customer_name: leadData.customer_name || prev.customer_name || selectedLead.customer_name || '',
          mobile: String(leadData.mobile || prev.mobile || selectedLead.mobile || ''),
          whatsapp_number: String(leadData.whatsapp_number || prev.whatsapp_number || leadData.mobile || prev.mobile || selectedLead.whatsapp_number || selectedLead.mobile || ''),
          email: leadData.email ?? prev.email ?? selectedLead.email ?? '',
          lead_source: leadData.lead_source || prev.lead_source || selectedLead.lead_source || 'Reference',
          Specify_Custom_Lead_Source_Name: leadData.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name || selectedLead.Specify_Custom_Lead_Source_Name || '',
          address: leadData.address || prev.address || selectedLead.address || '',
          city: leadData.city || prev.city || selectedLead.city || '',
          state: leadData.state || prev.state || selectedLead.state || '',
          pincode: leadData.pincode || prev.pincode || selectedLead.pincode || '',
          client_residence_address: leadData.client_residence_address || prev.client_residence_address || selectedLead.client_residence_address || '',
          desired_event_shoot_type: leadData.desired_event_shoot_type || prev.desired_event_shoot_type || selectedLead.desired_event_shoot_type || '',
          selected_package_id: prev.Select_Package_Option || prev.selected_package_id || leadData.Select_Package_Option || selectedLead.Select_Package_Option || '',
          status: leadData.status || leadData.current_status || prev.status || selectedLead.status || '',
        }));
      } catch (err) {
        console.warn("Failed to hydrate customer details from Supabase", err);
      }
    };

    hydrateCustomerDetails();

    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, supabaseClient]);

  // Step 2 Automatic Data Persistence & Prefill
  React.useEffect(() => {
    const isStep2 = (activeTab === 'create' && wizardStep === 2) || (activeTab === 'crm' && crmWizardStep === 2);
    const activeLeadId = activeTab === 'create' ? createdLeadId : selectedLead?.lead_id;

    if (!isStep2 || !activeLeadId || !supabaseClient) return;

    let isMounted = true;

    const loadStep2DataFromDB = async () => {
      try {
        // 1. Fetch lead details
        const { data: leadData, error: leadErr } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', activeLeadId)
          .maybeSingle();

        if (leadErr) {
          console.error("Error fetching lead for step 2:", leadErr);
          return;
        }

        if (!isMounted) return;

        // 2. Fetch lead events
        const { data: eventsData, error: eventsErr } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', activeLeadId);

        if (eventsErr) {
          console.error("Error fetching events for step 2:", eventsErr);
          return;
        }

        if (!isMounted) return;

        if (leadData) {
          // Restore follow-up details
          if (leadData.next_follow_up_date) {
            setStep2FollowUpDate(leadData.next_follow_up_date);
          }
          if (leadData.follow_up_notes) {
            setStep2FollowUpNotes(leadData.follow_up_notes);
          }
          
          setWizardLeadData(prev => ({
            ...prev,
            lead_source: leadData.lead_source || prev.lead_source,
            Specify_Custom_Lead_Source_Name: leadData.Specify_Custom_Lead_Source_Name || prev.Specify_Custom_Lead_Source_Name,
            client_residence_address: leadData.client_residence_address || prev.client_residence_address,
            city: leadData.city || prev.city,
            state: leadData.state || prev.state,
            pincode: leadData.pincode || prev.pincode,
            reference_source: leadData.reference_source || prev.reference_source,
          }));
        }

        if (eventsData && eventsData.length > 0) {
          const mappedEvents: LeadEvent[] = eventsData.map(ev => ({
            id: ev.id,
            event_type: ev.event_type,
            event_name: ev.event_name,
            event_date: ev.event_date,
            event_start_date: ev.event_date,
            event_end_date: ev.event_end_date || ev.Event_End_Date || '',
            event_location: ev.event_location,
            event_event_shoot_type: ev.event_shoot_type,
            guest_pax: ev.guest_pax,
            staff_pax: ev.staff_pax,
            event_start_time: ev.event_start_time,
            event_end_time: ev.event_end_time,
            google_maps_link: ev.google_maps_link,
            assigned_staff_names: ev.assigned_staff_names,
            assigned_staff_mobiles: ev.assigned_staff_mobiles,
            reporting_date: ev.reporting_date,
            reporting_time: ev.reporting_time
          }));

          if (activeTab === 'create') {
            setCreateEvents(mappedEvents);
          } else {
            setCrmEvents(mappedEvents);
          }

          // Pre-fill the form with the first event's details
          const firstEv = mappedEvents[0];
          setEventForm({
            event_type: firstEv.event_type || '',
            event_name: firstEv.event_name || '',
            event_date: firstEv.event_date || '',
            event_start_date: firstEv.event_date || '',
            event_end_date: firstEv.event_end_date || (firstEv as any).Event_End_Date || '',
            event_location: firstEv.event_location || '',
            event_event_shoot_type: firstEv.event_shoot_type || '',
            guest_pax: firstEv.guest_pax || '',
            staff_pax: firstEv.staff_pax || '',
            event_start_time: firstEv.event_start_time || '',
            event_end_time: firstEv.event_end_time || '',
            google_maps_link: firstEv.google_maps_link || ''
          });
          setEditingEventId(firstEv.id);
          setShowEventForm(true); // Force form to display so fields are not blank
        }
      } catch (err) {
        console.error("Error in loadStep2DataFromDB effect:", err);
      }
    };

    loadStep2DataFromDB();

    return () => {
      isMounted = false;
    };
  }, [wizardStep, crmWizardStep, activeTab, createdLeadId, selectedLead?.lead_id, supabaseClient]);

  // Auto-scroll and focus transitions for Sales Popups & Forms
  React.useEffect(() => {
    if (activeTab === 'create') {
      triggerAutoScrollAndFocus('#create_lead_form', 150);
    }
  }, [wizardStep, activeTab]);

  React.useEffect(() => {
    if (selectedLead) {
      triggerAutoScrollAndFocus('#lead_details_mobile_modal', 150);
    }
  }, [crmWizardStep, selectedLead?.lead_id]);

  React.useEffect(() => {
    if (isAddFormOpen || editingPackage) {
      triggerAutoScrollAndFocus('#add_edit_package_modal', 150);
    }
  }, [isAddFormOpen, editingPackage]);

  React.useEffect(() => {
    if (showConfirmModal) {
      if (selectedLead) {
         initEventsReporting(selectedLead);
         setConfirmForm(prev => ({
            ...prev,
            quotation_amount: Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_quotation_amount) || Number(wizardLeadData.final_amount) || Number(selectedLead.final_amount) || prev.quotation_amount || 0
         }));
      }
    }
  }, [showConfirmModal, selectedLead?.lead_id]);

  React.useEffect(() => {
    if (showFinalReportingModal) {
      triggerAutoScrollAndFocus('#final_reporting_modal', 150);
    }
  }, [showFinalReportingModal]);

  React.useEffect(() => {
    if (showStep3Popup) {
      triggerAutoScrollAndFocus('#step3_followup_modal', 150);
    }
  }, [showStep3Popup]);

  React.useEffect(() => {
    // Completely removed automated quotation number generation as per instructions
  }, [wizardStep, crmWizardStep, activeQuoteNum]);

  const getSelectedPkgsInfo = (isEdit: boolean) => {
    const finalPkgId = (isEdit
      ? (wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option)
      : (wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedPkgIds[0])) || 'Custom Package';

    const explicitPkgCost = (wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null && wizardLeadData.package_cost !== '' && !isNaN(Number(wizardLeadData.package_cost)))
      ? Number(wizardLeadData.package_cost)
      : ((selectedLead?.package_price !== undefined && selectedLead?.package_price !== null && !isNaN(Number(selectedLead?.package_price)))
        ? Number(selectedLead?.package_price)
        : undefined);

    if (finalPkgId === 'Custom Package' || finalPkgId === 'custom_package') {
      return [{
        package_name: 'Custom Package',
        package_id: 'Custom Package',
        package_cost: explicitPkgCost !== undefined ? explicitPkgCost : (Number(wizardLeadData.package_cost) || 0),
        deliverables: wizardLeadData.deliverables || '',
        inclusions: '',
        team_members: '',
        seasonal_offer: '',
        terms_conditions: '',
        event_type: '',
        duration: '',
        category: ''
      }];
    }

    const primaryPkg = (packages || []).find(p => String(p.package_id) === String(finalPkgId) || String(p.package_name) === String(finalPkgId));
    if (primaryPkg) {
      return [{
        package_name: primaryPkg.package_name,
        package_id: primaryPkg.package_id,
        package_cost: explicitPkgCost !== undefined ? explicitPkgCost : (pkgPrices[primaryPkg.package_id] !== undefined ? Number(pkgPrices[primaryPkg.package_id]) : (Number(wizardLeadData.package_cost) || Number(primaryPkg.price) || 0)),
        deliverables: wizardLeadData.deliverables || pkgDeliverables[primaryPkg.package_id] || primaryPkg.deliverables || '',
        inclusions: primaryPkg.package_includes || '',
        team_members: primaryPkg.team_members || '',
        seasonal_offer: primaryPkg.seasonal_offer || '',
        terms_conditions: primaryPkg.terms_conditions || '',
        event_type: primaryPkg.event_type || '',
        duration: primaryPkg.duration || '',
        category: primaryPkg.category || ''
      }];
    }

    return [{
      package_name: wizardLeadData.package_name || 'Custom Package',
      package_id: finalPkgId || 'Custom Package',
      package_cost: explicitPkgCost !== undefined ? explicitPkgCost : (Number(wizardLeadData.package_cost) || 0),
      deliverables: wizardLeadData.deliverables || '',
      inclusions: '',
      team_members: '',
      seasonal_offer: '',
      terms_conditions: '',
      event_type: '',
      duration: '',
      category: ''
    }];
  };

  const dynamicBaseSum = getSelectedPkgsInfo(crmWizardStep > 0).reduce((sum, p) => sum + Number(p.package_cost || 0), 0);
  const dynamicAdditionalSum = quoteServices
    .filter(s => s.isAdditional)
    .reduce((sum, s) => sum + (Number(s.qty) * Number(s.price)), 0);
    const discountVal = Number(quoteDiscount || 0);
  const rawDynamicFinalAmt = Math.max(0, dynamicBaseSum + Number(quoteAdditional || 0) - discountVal);
  const dynamicFinalAmt = Number.isNaN(rawDynamicFinalAmt) ? 0 : rawDynamicFinalAmt;

  React.useEffect(() => {
    setWizardLeadData(prev => {
      if (prev.final_amount !== dynamicFinalAmt) {
        return { ...prev, final_amount: dynamicFinalAmt };
      }
      return prev;
    });
  }, [dynamicFinalAmt]);

  const getLeadInfoForQuote = (isEdit: boolean) => {
    const effectiveSalesName = getEffectiveSalesStaffName();
    const effectiveSalesMobile = getEffectiveSalesStaffMobile();

    const explicitPkgCost = Number(
      wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null && wizardLeadData.package_cost !== '' && !isNaN(Number(wizardLeadData.package_cost))
        ? Number(wizardLeadData.package_cost)
        : (wizardLeadData.package_price !== undefined && wizardLeadData.package_price !== null && wizardLeadData.package_price !== '' && !isNaN(Number(wizardLeadData.package_price))
          ? Number(wizardLeadData.package_price)
          : (selectedLead?.package_price || selectedLead?.budget || 0))
    );
    const finalAmountVal = dynamicFinalAmt || Math.max(0, explicitPkgCost - Number(quoteDiscount || 0) + Number(quoteAdditional || 0));

    const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || '');
    const activeLead = selectedLead || leads?.find((l: any) => l.lead_id === currentLeadId);
    const linkedOrder = orders?.find((o: any) => currentLeadId && (o.lead_id === currentLeadId || o.order_id === currentLeadId));
    const resolvedOrderId = selectedLead?.order_id || (selectedLead as any)?.Order_ID || linkedOrder?.order_id || (activeLead as any)?.order_id || wizardLeadData.order_id || '';
    const linkedPayment = linkedOrder ? payments?.find((p: any) => p.order_id === linkedOrder.order_id) : payments?.find((p: any) => (resolvedOrderId && p.order_id === resolvedOrderId) || (currentLeadId && p.lead_id === currentLeadId));

    const isOrderConfirmed = Boolean(
      isLeadConfirmed ||
      wizardLeadData.status === 'Order Confirmed' ||
      salesStatus === 'Order Confirmed' ||
      (activeLead && ['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(activeLead.status || '')) ||
      (activeLead && (activeLead as any).current_status === 'Order Confirmed') ||
      (activeLead && (activeLead as any).booking_status === 'Confirmed') ||
      (linkedOrder && linkedOrder.status !== 'Cancelled') ||
      (orders && orders.some((o: any) => (currentLeadId && o.lead_id === currentLeadId && o.status !== 'Cancelled') || (resolvedOrderId && o.order_id === resolvedOrderId && o.status !== 'Cancelled')))
    );

    let advanceAmt = 0;
    const paymentsBreakdown: { label: string; amount: number }[] = [];

    // Filter payment history from context and local pending
    const matchOrderId = resolvedOrderId || linkedOrder?.order_id || '';
    const matchLeadId = currentLeadId || '';

    let localPending: any[] = [];
    try {
      const saved = localStorage.getItem('pending_payment_approvals');
      if (saved) localPending = JSON.parse(saved) || [];
    } catch (_) {}

    let approvedIds = new Set<string>();
    try {
      const appSaved = localStorage.getItem('approved_payment_history_ids');
      if (appSaved) approvedIds = new Set(JSON.parse(appSaved));
    } catch (_) {}

    let rejectedIds = new Set<string>();
    try {
      const rejSaved = localStorage.getItem('rejected_payment_history_ids');
      if (rejSaved) rejectedIds = new Set(JSON.parse(rejSaved));
    } catch (_) {}

    const combinedHistMap = new Map<string, any>();
    (paymentHistory || []).forEach((h: any) => {
      const k = String(h.id || h.payment_history_id || '');
      if (k) combinedHistMap.set(k, h);
    });
    localPending.forEach((h: any) => {
      const k = String(h.id || h.payment_history_id || '');
      if (k && !combinedHistMap.has(k)) combinedHistMap.set(k, h);
    });

    const validOrderHistories = Array.from(combinedHistMap.values()).filter((h: any) => {
      const hid = String(h.order_id || '').trim();
      if (!hid) return false;
      const isMatch = (matchOrderId && hid === matchOrderId) || 
                      (matchLeadId && (hid === matchLeadId || hid === `ORD-${matchLeadId}`));
      if (!isMatch) return false;

      const histId = String(h.id || h.payment_history_id || '');
      const isRejected = h.approval_status === 'Rejected' || 
        rejectedIds.has(histId) || 
        (typeof h.notes === 'string' && (
          h.notes.includes('Rejected') || 
          h.notes.includes('[REJECTED]') || 
          h.notes.endsWith('- Rejected') || 
          h.notes.toLowerCase().includes('rejected by business owner')
        ));
      return !isRejected;
    });

    const advanceItems = validOrderHistories.filter((h: any) => {
      const type = String(h.payment_type || h.Payment_type || '').trim().toLowerCase();
      if (type === 'advance payment' || type === 'advance') return true;
      if (!type && typeof h.notes === 'string' && h.notes.toLowerCase().includes('advance')) return true;
      return false;
    });

    if (advanceItems.length > 0) {
      advanceAmt = advanceItems.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
    } else if (isOrderConfirmed) {
      if (linkedOrder && linkedOrder.advance_received !== undefined && Number(linkedOrder.advance_received) > 0) {
        advanceAmt = Number(linkedOrder.advance_received);
      } else if (linkedPayment && linkedPayment.advance_received !== undefined && Number(linkedPayment.advance_received) > 0 && linkedPayment.payment_status !== 'Rejected' && linkedPayment.payment_status !== 'Cancelled') {
        advanceAmt = Number(linkedPayment.advance_received);
      } else if (wizardLeadData.advance_received !== undefined && Number(wizardLeadData.advance_received) > 0) {
        advanceAmt = Number(wizardLeadData.advance_received);
      } else if (activeLead?.advance_collected !== undefined && Number(activeLead.advance_collected) > 0) {
        advanceAmt = Number(activeLead.advance_collected);
      } else if (selectedLead?.advance_received !== undefined && Number(selectedLead.advance_received) > 0) {
        advanceAmt = Number(selectedLead.advance_received);
      }
    }

    if (advanceAmt > 0) {
      paymentsBreakdown.push({ label: 'Advance Payment', amount: advanceAmt });
    }

    const otherItems = validOrderHistories.filter((h: any) => !advanceItems.includes(h));
    const otherMap = new Map<string, number>();
    otherItems.forEach((h: any) => {
      const rawType = String(h.payment_type || h.Payment_type || '').trim() || 'Payment';
      let label = rawType;
      if (rawType.toLowerCase().includes('shoot') || rawType.toLowerCase().includes('event')) {
        label = 'Event Date Payment';
      } else if (rawType.toLowerCase().includes('final')) {
        label = 'Final Payment';
      }
      const amt = Number(h.amount) || 0;
      if (amt > 0) {
        otherMap.set(label, (otherMap.get(label) || 0) + amt);
      }
    });
    otherMap.forEach((amt, lbl) => {
      paymentsBreakdown.push({ label: lbl, amount: amt });
    });

    const totalPaidVal = paymentsBreakdown.reduce((sum, p) => sum + p.amount, 0);
    const pendingAmountVal = Math.max(0, finalAmountVal - totalPaidVal);

    if (isEdit) {
      return {
        ...selectedLead,
        order_id: resolvedOrderId || selectedLead?.order_id || '',
        is_order_confirmed: isOrderConfirmed,
        advance_received: advanceAmt,
        advance_payment_received: advanceAmt,
        advance_collected: advanceAmt,
        payments_breakdown: paymentsBreakdown,
        total_paid_amount: totalPaidVal,
        pending_amount: pendingAmountVal,
        customer_name: wizardLeadData.customer_name,
        mobile: wizardLeadData.mobile,
        email: wizardLeadData.email,
        event_date: wizardLeadData.event_date,
        event_location: wizardLeadData.event_location,
        event_type: wizardLeadData.event_type,
        event_shoot_type: wizardLeadData.event_shoot_type,
        budget: explicitPkgCost || finalAmountVal,
        package_price: explicitPkgCost,
        package_cost: explicitPkgCost,
        Quotation_Discount: Number(quoteDiscount || 0),
        quotation_discount: Number(quoteDiscount || 0),
        Additional_Services_Cost: Number(quoteAdditional || 0),
        additional_services_cost: Number(quoteAdditional || 0),
        whatsapp_number: wizardLeadData.whatsapp_number,
        address: wizardLeadData.address,
        city: wizardLeadData.city,
        state: wizardLeadData.state,
        pincode: wizardLeadData.pincode,
        client_residence_address: wizardLeadData.client_residence_address,
        desired_event_shoot_type: wizardLeadData.desired_event_shoot_type,
        deliverables_description: wizardLeadData.deliverables,
        notes_special_customizations: wizardLeadData.notes,
        selected_package_id: wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option || '',
        sales_staff_name: effectiveSalesName,
        sales_staff_mobile: effectiveSalesMobile,
        events: sortEventsAscending(crmEvents || []),
        Final_Quotation_Amount: finalAmountVal || wizardLeadData.final_quoted_amount || wizardLeadData.budget || selectedLead?.Final_Quotation_Amount || selectedLead?.final_quotation_amount || selectedLead?.final_amount,
        final_quotation_amount: finalAmountVal || wizardLeadData.final_quoted_amount || wizardLeadData.budget || selectedLead?.final_quotation_amount || selectedLead?.Final_Quotation_Amount || selectedLead?.final_amount,
        final_amount: finalAmountVal || wizardLeadData.final_quoted_amount || wizardLeadData.budget || selectedLead?.final_amount || selectedLead?.Final_Quotation_Amount || selectedLead?.final_quotation_amount,
        dynamicFinalAmt: finalAmountVal
      };
    } else {
      return {
        ...createForm,
        lead_id: createdLeadId || 'DRAFT-LEAD',
        order_id: resolvedOrderId || '',
        is_order_confirmed: isOrderConfirmed,
        advance_received: advanceAmt,
        advance_payment_received: advanceAmt,
        advance_collected: advanceAmt,
        payments_breakdown: paymentsBreakdown,
        total_paid_amount: totalPaidVal,
        pending_amount: pendingAmountVal,
        package_price: explicitPkgCost,
        package_cost: explicitPkgCost,
        Quotation_Discount: Number(quoteDiscount || 0),
        quotation_discount: Number(quoteDiscount || 0),
        Additional_Services_Cost: Number(quoteAdditional || 0),
        additional_services_cost: Number(quoteAdditional || 0),
        deliverables_description: selectedPkgs.map(p => pkgDeliverables[p.id] || p.deliverables || 'N/A').join('\n'),
        notes_special_customizations: selectedPkgs.map(p => pkgNotes[p.id] || '').join('\n'),

        sales_staff_name: effectiveSalesName,
        sales_staff_mobile: effectiveSalesMobile,
        events: sortEventsAscending(createEvents || []),
        Final_Quotation_Amount: finalAmountVal || createForm.budget,
        final_quotation_amount: finalAmountVal || createForm.budget,
        final_amount: finalAmountVal || createForm.budget,
        dynamicFinalAmt: finalAmountVal
      };
    }
  };

  const validateLeadForQuotation = (leadObj: any, activePkgs: any[]) => {
    const missing: string[] = [];
    if (!String(leadObj.customer_name || '').trim()) missing.push('Customer Name');
    if (!String(leadObj.mobile || '').trim()) missing.push('Mobile Number');
    if (!String(leadObj.event_type || '').trim()) missing.push('Event Type');
    if (!String(leadObj.event_date || '').trim()) missing.push('Event Date');
    if (!String(leadObj.event_location || '').trim() && !String(leadObj.location || '').trim()) missing.push('Event Location');
    if (activePkgs.length === 0) missing.push('At least one selected package');
    return missing;
  };

  const handleGenerateQuote = async (isEdit: boolean): Promise<string | null> => {
    setIsSaving(true);
    console.log("✔ Starting quotation generation...");
    try {
      const effName = getEffectiveSalesStaffName();
      const effMobile = getEffectiveSalesStaffMobile();
      if (!salesStaffName || !salesStaffName.trim()) setSalesStaffName(effName);
      if (!salesStaffMobile || !salesStaffMobile.trim()) setSalesStaffMobile(effMobile);

      const leadObj = getLeadInfoForQuote(isEdit);
      const leadIdForError = leadObj?.lead_id || createdLeadId || 'UNKNOWN';

      console.log("✔ Validating form...");
      const activePkgs = getSelectedPkgsInfo(isEdit);

      const missingFields = validateLeadForQuotation(leadObj, activePkgs);
      if (missingFields.length > 0) {
        showErrorHelper(
          "Quotation Incomplete",
          `Missing required fields: ${missingFields.join(', ')}`,
          "validateLeadForQuotation()",
          leadIdForError,
          "Complete all required fields before generating the quotation."
        );
        setIsSaving(false);
        return null;
      }

      const basePkgSum = dynamicBaseSum;
      const finalAmt = dynamicFinalAmt;

      const leadId = leadObj.lead_id || 'DRAFT-LEAD';
      let dbQuote = null;
      if (supabaseClient && leadId !== 'DRAFT-LEAD') {
        const { data, error } = await supabaseClient
          .from('quotations')
          .select('quotation_id, quotation_number, created_at')
          .eq('lead_id', leadId)
          .maybeSingle();
        if (!error && data) {
          dbQuote = data;
        }
      }

      const existingQuotation = dbQuote || (quotations || []).find(q => q.lead_id === leadId);
      
      const d = new Date();
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const randomFour = String(Math.floor(1 + Math.random() * 9999)).padStart(4, '0');
      const generatedQuotNum = existingQuotation ? existingQuotation.quotation_number : `QT-${dateStr}-${randomFour}`;
      const quotNum = activeQuoteNum || generatedQuotNum;
      
      console.log(`✔ Creating/Updating quotation ${quotNum}...`);
      const qId = existingQuotation ? existingQuotation.quotation_id : ('QT-' + Math.random().toString(36).substring(2, 9).toUpperCase());
      
      const activePkgId = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || 'Custom Package';
      const { teamMembersJson, deliverablesJson, teamMembersText, deliverablesText } = buildStep3EventPayloads(
        activePkgId,
        crmEvents,
        editableInclusions,
        editableDeliverables
      );
      
      const activeDeliverablesText = (deliverablesText === '[]' && leadObj.deliverables_description && leadObj.deliverables_description !== '[]') 
        ? leadObj.deliverables_description 
        : deliverablesText;
        
      const activeTeamMembersText = (teamMembersText === '[]' && (leadObj.Team_member || leadObj.Team_Members) && (leadObj.Team_member !== '[]' || leadObj.Team_Members !== '[]'))
        ? (leadObj.Team_member || leadObj.Team_Members)
        : teamMembersText;
        
      let finalBasePkgSum = basePkgSum;
      if (finalBasePkgSum === 0 && leadObj.package_price && leadObj.package_price > 0) {
        finalBasePkgSum = leadObj.package_price;
      }

      const standardQuotation = {
        quotation_id: qId,
        quotation_number: quotNum,
        lead_id: leadId,
        customer_id: leadObj.customer_name || '',
        customer_name: leadObj.customer_name || '',
        order_id: '',
        package_name: activePkgs.map(p => p.package_name).join(' + '),
        package_price: finalBasePkgSum,
        quotation_amount: finalBasePkgSum + Number(quoteAdditional || 0),
        discount: quoteDiscount,
        discount_amount: quoteDiscount,
        additional_services_cost: Number(quoteAdditional || 0),
        final_quotation_amount: finalAmt,
        final_amount: finalAmt,
        tax_amount: 0,
        quotation_status: 'Sent',
        pdf_url: '',
        generated_date: new Date().toISOString().split('T')[0],
        created_at: existingQuotation ? existingQuotation.created_at : new Date().toISOString(),
        created_by: salesStaffName || 'System',
        whatsapp_sent_status: false,
        viewed_status: false,
        terms_conditions: quotationTerms,
        deliverables_description: activeDeliverablesText,
        notes_special_customizations: leadObj.notes_special_customizations,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalAmt,
        client_residence_address: leadObj.client_residence_address,
        city: leadObj.city,
        state: leadObj.state,
        pincode: leadObj.pincode,
        desired_event_shoot_type: leadObj.desired_event_shoot_type || leadObj.shoot_type,

        editableInclusions: editableInclusions,
        editableDeliverables: editableDeliverables
      };

      console.log("✔ Saving to Supabase...");
      const finalQuoteNum = await addQuotation(standardQuotation);
      console.log(`✔ Quotation saved successfully. Confirmed Quotation Number: ${finalQuoteNum}`);
      setActiveQuoteNum(finalQuoteNum);

      if (isEdit) {
        if (wizardLeadData.selected_package_id) {
          const selectedPkg = packages.find((p) => p.package_id === wizardLeadData.selected_package_id);
          const activePackagesList = (leadPackages || []).filter(lp => lp.lead_id === selectedLead.lead_id);
          
          if (!activePackagesList.some(lp => lp.package_id === wizardLeadData.selected_package_id)) {
            activePackagesList.push({
              package_id: wizardLeadData.selected_package_id,
              package_name: selectedPkg?.package_name || 'Selected Package',
              package_cost: Number(wizardLeadData.package_cost),
              quantity: 1,
              total_amount: Number(wizardLeadData.package_cost),
              discount: 0,
              final_amount: Number(wizardLeadData.package_cost),
              deliverables_description: activeDeliverablesText,
              notes_special_customizations: wizardLeadData.notes,
              additional_services_cost: 0,
              team_members: '',
              deliverables: ''
            } as any);
          }
          
          const payloadToSave = activePackagesList.map(lp => {
            const isPrimary = lp.package_id === wizardLeadData.selected_package_id;
            const incStr = (editableInclusions[lp.package_id!] || []).join(', ');
            const delStr = (editableDeliverables[lp.package_id!] || []).join(', ');
            
            // Protect against empty object overwriting valid data during a race condition
            const hasNewInclusions = Object.keys(editableInclusions).length > 0;
            const hasNewDeliverables = Object.keys(editableDeliverables).length > 0;
            
            return {
              package_id: lp.package_id!,
              package_name: lp.package_name || 'Selected Package',
              package_cost: isPrimary ? Number(wizardLeadData.package_cost) : lp.package_cost,
              quantity: lp.quantity || 1,
              total_amount: isPrimary ? Number(wizardLeadData.package_cost) : lp.total_amount,
              discount: lp.discount || 0,
              final_amount: isPrimary ? Number(wizardLeadData.package_cost) : lp.final_amount,
              deliverables_description: isPrimary ? activeDeliverablesText : lp.deliverables_description,
              notes_special_customizations: isPrimary ? wizardLeadData.notes : lp.notes_special_customizations,
              additional_services_cost: lp.additional_services_cost || 0,
              team_members: incStr || lp.team_members || '',
              deliverables: delStr || lp.deliverables || '',
              ...(hasNewInclusions ? { editable_inclusions: editableInclusions, Team_Members_Included: teamMembersJson } : {}),
              ...(hasNewDeliverables ? { editable_deliverables: editableDeliverables, deliverables_descriptionn: deliverablesJson } : {}),
            };
          });

          await saveLeadPackages(selectedLead.lead_id, payloadToSave);
        }

        const updatedRemarks = appendCompletedStep(wizardLeadData.notes || '', 3);

        setWizardLeadData(prev => ({
          ...prev,
          budget: finalAmt,
          final_quoted_amount: finalAmt,
          status: 'Quotation Sent' as CurrentStage,
          remarks: updatedRemarks,
          deliverables: activeDeliverablesText,
          deliverables_description: activeDeliverablesText,
          Team_member: activeTeamMembersText,
          Team_Members: activeTeamMembersText,
          team_members: activeTeamMembersText
        }));
        await updateLead(leadObj.lead_id, {
          budget: finalAmt,
          status: 'Quotation Sent' as CurrentStage,
          package_price: finalBasePkgSum,
          deliverables_description: activeDeliverablesText,
          Team_member: activeTeamMembersText,
          Team_Members: activeTeamMembersText,
          team_members: activeTeamMembersText,
          notes_special_customizations: leadObj.notes_special_customizations,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalAmt,
          
          client_residence_address: leadObj.client_residence_address,
          city: leadObj.city,
          state: leadObj.state,
          pincode: leadObj.pincode,
          desired_event_shoot_type: leadObj.desired_event_shoot_type || leadObj.shoot_type,
          remarks: updatedRemarks,
          Select_Package_Option: leadObj.Select_Package_Option || ''
        });
        
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'Quotation Sent' as CurrentStage,
            remarks: updatedRemarks
          };
        });
      } else {
        setCreateForm(prev => ({
          ...prev,
          budget: finalAmt
        }));
        setSalesStatus('Quotation Sent');
        await updateLead(createdLeadId!, {
          budget: finalAmt,
          status: 'Quotation Sent' as CurrentStage,
          package_price: finalBasePkgSum,
          deliverables_description: activeDeliverablesText,
          Team_member: activeTeamMembersText,
          Team_Members: activeTeamMembersText,
          team_members: activeTeamMembersText,
          notes_special_customizations: leadObj.notes_special_customizations,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalAmt,
          sales_staff_name: salesStaffName,
          sales_staff_mobile: salesStaffMobile,
          client_residence_address: leadObj.client_residence_address,
          city: leadObj.city,
          state: leadObj.state,
          pincode: leadObj.pincode,
          desired_event_shoot_type: leadObj.desired_event_shoot_type || leadObj.shoot_type,
          remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city),
            next_follow_up_date: followUpDate || undefined,
          follow_up_notes: internalNotes || undefined,
          selected_package_id: leadObj.Select_Package_Option || ''
        });
      }

      console.log("✔ Process completed");
      return finalQuoteNum;
    } catch (err: any) {
      showErrorHelper(
        "Quotation Save Failed",
        err.message || "Failed to save quotation data to the database.",
        "handleGenerateQuote()",
        isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
        "Check your network connection and ensure the lead data is valid.",
        err
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewQuotePDF = async (isEdit: boolean) => {
    try {
      const effName = getEffectiveSalesStaffName();
      const effMobile = getEffectiveSalesStaffMobile();
      if (!salesStaffName || !salesStaffName.trim()) setSalesStaffName(effName);
      if (!salesStaffMobile || !salesStaffMobile.trim()) setSalesStaffMobile(effMobile);

      const leadObj = getLeadInfoForQuote(isEdit);

      // Re-fetch latest payment data for exact order to guarantee fresh, non-stale payment info
      try {
        const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || createdLeadId || '');
        const resolvedOrderId = leadObj.order_id || selectedLead?.order_id || '';
        const paymentData = await fetchAndResolveLatestPaymentData(
          currentLeadId,
          resolvedOrderId,
          paymentHistory,
          allOrders,
          allPayments,
          allLeads
        );
        if (paymentData.exactOrderId && !leadObj.order_id) {
          leadObj.order_id = paymentData.exactOrderId;
        }
        if (paymentData.hasAdvance || paymentData.advanceAmount > 0) {
          leadObj.advance_received = paymentData.advanceAmount;
          leadObj.advance_payment_received = paymentData.advanceAmount;
          leadObj.advance_collected = paymentData.advanceAmount;
          leadObj.is_order_confirmed = true;
        }
        if (paymentData.paymentsBreakdown && paymentData.paymentsBreakdown.length > 0) {
          leadObj.payments_breakdown = paymentData.paymentsBreakdown;
        }
        leadObj.total_paid_amount = paymentData.totalPaidAmount;
        leadObj.pending_amount = paymentData.pendingAmount;
        if (paymentData.totalPaidAmount > 0) {
          leadObj.is_order_confirmed = true;
        }
      } catch (pErr) {
        console.warn("Could not re-fetch payment data for preview, proceeding:", pErr);
      }

      const activePkgs = getSelectedPkgsInfo(isEdit);

      const missingFields = validateLeadForQuotation(leadObj, activePkgs);
      if (missingFields.length > 0) {
        showToastMsg(`Quotation Incomplete! Please enter the following fields: ${missingFields.join(', ')}`, "error");
        return;
      }

      let currentLogo = logoBase64;
      let currentAspect = logoAspectRatio;
      try {
        const logoUrl = 'https://aqifyxsimhqayfjwzzwj.supabase.co/storage/v1/object/public/img/logo%20(4)%20(1).png';
        const result = await getLogoBase64FromUrl(logoUrl);
        currentLogo = result.base64;
        currentAspect = result.aspect;
      } catch (e) {
        console.warn("Failed to wait-load logo for preview, using preloaded:", e);
      }

      const doc = generateQuotationPDF(
        leadObj,
        activePkgs,
        "",
        quotationTerms,
        currentLogo,
        currentAspect,
        editableInclusions,
        editableDeliverables,
        Number(quoteDiscount || 0),
        Number(quoteAdditional || 0),
        quoteServices
      );
      
      const blobUrl = doc.output('bloburl');
      setGeneratedPDFBlobUrl(blobUrl);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to preview PDF.");
    }
  };

  const handleDownloadQuotePDF = async (isEdit: boolean) => {
    try {
      console.log("✔ Generating PDF...");
      const leadObj = getLeadInfoForQuote(isEdit);

      // Re-fetch latest payment data for exact order to guarantee fresh, non-stale payment info
      try {
        const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || createdLeadId || '');
        const resolvedOrderId = leadObj.order_id || selectedLead?.order_id || '';
        const paymentData = await fetchAndResolveLatestPaymentData(
          currentLeadId,
          resolvedOrderId,
          paymentHistory,
          allOrders,
          allPayments,
          allLeads
        );
        if (paymentData.exactOrderId && !leadObj.order_id) {
          leadObj.order_id = paymentData.exactOrderId;
        }
        if (paymentData.hasAdvance || paymentData.advanceAmount > 0) {
          leadObj.advance_received = paymentData.advanceAmount;
          leadObj.advance_payment_received = paymentData.advanceAmount;
          leadObj.advance_collected = paymentData.advanceAmount;
          leadObj.is_order_confirmed = true;
        }
        if (paymentData.paymentsBreakdown && paymentData.paymentsBreakdown.length > 0) {
          leadObj.payments_breakdown = paymentData.paymentsBreakdown;
        }
        leadObj.total_paid_amount = paymentData.totalPaidAmount;
        leadObj.pending_amount = paymentData.pendingAmount;
        if (paymentData.totalPaidAmount > 0) {
          leadObj.is_order_confirmed = true;
        }
      } catch (pErr) {
        console.warn("Could not re-fetch payment data for PDF download, proceeding:", pErr);
      }

      const activePkgs = getSelectedPkgsInfo(isEdit);
      
      const doc = generateQuotationPDF(
        leadObj,
        activePkgs,
        "",
        quotationTerms,
        logoBase64,
        logoAspectRatio,
        editableInclusions,
        editableDeliverables,
        Number(quoteDiscount || 0),
        Number(quoteAdditional || 0),
        quoteServices
      );
      
      console.log("✔ PDF generated");
      const pdfFileName = generateQuotationPdfFileName(leadObj);
      doc.save(pdfFileName);
      
      showToastMsg("Quotation successfully generated!", "success");
    } catch (err: any) {
      showErrorHelper(
        "PDF Generation Failed",
        err.message || "jsPDF failed to render the quotation document.",
        "handleDownloadQuotePDF()",
        isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
        "Check console logs to see if there is an issue with the document template or variables.",
        err
      );
    }
  };

  const handleSendWhatsAppQuote = async (isEdit: boolean) => {
    try {
      console.log("✔ Generating PDF...");
      const leadObj = getLeadInfoForQuote(isEdit);

      // Re-fetch latest payment data for exact order to guarantee fresh, non-stale payment info
      try {
        const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || createdLeadId || '');
        const resolvedOrderId = leadObj.order_id || selectedLead?.order_id || '';
        const paymentData = await fetchAndResolveLatestPaymentData(
          currentLeadId,
          resolvedOrderId,
          paymentHistory,
          allOrders,
          allPayments,
          allLeads
        );
        if (paymentData.exactOrderId && !leadObj.order_id) {
          leadObj.order_id = paymentData.exactOrderId;
        }
        if (paymentData.hasAdvance || paymentData.advanceAmount > 0) {
          leadObj.advance_received = paymentData.advanceAmount;
          leadObj.advance_payment_received = paymentData.advanceAmount;
          leadObj.advance_collected = paymentData.advanceAmount;
          leadObj.is_order_confirmed = true;
        }
        if (paymentData.paymentsBreakdown && paymentData.paymentsBreakdown.length > 0) {
          leadObj.payments_breakdown = paymentData.paymentsBreakdown;
        }
        leadObj.total_paid_amount = paymentData.totalPaidAmount;
        leadObj.pending_amount = paymentData.pendingAmount;
        if (paymentData.totalPaidAmount > 0) {
          leadObj.is_order_confirmed = true;
        }
      } catch (pErr) {
        console.warn("Could not re-fetch payment data for WhatsApp quote, proceeding:", pErr);
      }

      const activePkgs = getSelectedPkgsInfo(isEdit);
      const finalAmt = dynamicFinalAmt;

      const doc = generateQuotationPDF(
        leadObj,
        activePkgs,
        "",
        quotationTerms,
        logoBase64,
        logoAspectRatio,
        editableInclusions,
        editableDeliverables,
        Number(quoteDiscount || 0),
        Number(quoteAdditional || 0),
        quoteServices
      );
      
      console.log("✔ PDF generated");
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      setGeneratedPDFBlobUrl(blobUrl);

      // Download the PDF automatically as requested
      const pdfFileName = generateQuotationPdfFileName(leadObj);
      doc.save(pdfFileName);

      console.log("✔ Opening WhatsApp...");
      const rawPhone = leadObj.whatsapp_number || leadObj.mobile || '';
      const phoneStr = typeof rawPhone === 'string' ? rawPhone : String(rawPhone);
      
      const safeCustomerName = String(leadObj.customer_name || '');
      let eventDetailsStr = '';
      if (leadObj.events && leadObj.events.length > 0) {
        eventDetailsStr = leadObj.events.map((ev) => {
          const eName = ev.event_name || ev.event_type || 'Event';
          const eDate = ev.event_date ? (formatDateDDMMYY(ev.event_date) || ev.event_date) : 'N/A';
          const eTime = ev.event_start_time ? convertTo12Hour(ev.event_start_time) : '';
          return `🎉 ${eName}\n📅 Date: ${eDate}${eTime ? ` | Time: ${eTime}` : ''}`;
        }).join('\n\n') + '\n';
      } else {
        const safeEventType = String(leadObj.event_type || 'Event');
        const safeEventDate = leadObj.event_date ? (formatDateDDMMYY(leadObj.event_date) || leadObj.event_date) : 'N/A';
        eventDetailsStr = `🎉 Event: ${safeEventType}\n📅 Event Date: ${safeEventDate}\n`;
      }

      const message = `Hello *${safeCustomerName}*,\n\n` +
        `Thank you for choosing *PhotoCrew Pictures*.\n\n` +
        `Please find your quotation details below:\n\n` +
        eventDetailsStr +
        `💰 Final Amount: ₹${finalAmt.toLocaleString('en-IN')}\n\n` +
        `Thank you.\nPhotoCrew Pictures`;

      const cleanPhone = phoneStr.replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        showErrorHelper(
          "WhatsApp Redirect Failed",
          "Customer WhatsApp or mobile number is missing.",
          "handleSendWhatsAppQuote()",
          isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
          "Enter a valid mobile/WhatsApp number in Customer Details."
        );
        return;
      }
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');

      showToastMsg("Quotation downloaded and WhatsApp prepared!", "success");
      console.log("✔ Process completed");
    } catch (err: any) {
      showErrorHelper(
        "WhatsApp Redirect Failed",
        err.message || "Failed to prepare WhatsApp message or generate PDF.",
        "handleSendWhatsAppQuote()",
        isEdit && selectedLead ? selectedLead.lead_id : (createdLeadId || 'UNKNOWN'),
        "Check console logs to see if there is an issue with the document template or variables.",
        err
      );
    }
  };

  const handleSendEmailQuote = async (isEdit: boolean) => {
    try {
      const leadObj = getLeadInfoForQuote(isEdit);
      const activePkgs = getSelectedPkgsInfo(isEdit);
      const basePkgSum = dynamicBaseSum;
      const finalAmt = dynamicFinalAmt;
      
      const pkgNames = activePkgs.map(p => p.package_name).join(' + ') || 'Selected Package';
      const email = leadObj.email || '';
      
      const safeCustomerName = String(leadObj.customer_name || '');
      const safeEventType = String(leadObj.event_type || 'Event');

      const subject = `Photocrew Pictures - Custom Quotation Details`;
      const body = `Dear ${safeCustomerName},\n\n` +
        `Thank you for reach out to us! We are pleased to provide the custom quotation details for your upcoming ${safeEventType} shoot.\n\n` +
        `Selected Package: ${pkgNames}\n` +
        `Package Base Price: Rs. ${basePkgSum.toLocaleString('en-IN')}\n` +
        `Discount Applied: Rs. ${(quoteDiscount || 0).toLocaleString('en-IN')}\n` +
        `Final Quotation Amount: Rs. ${finalAmt.toLocaleString('en-IN')}\n\n` +
        `We will follow up shortly to discuss any specific adjustments you might need.\n\n` +
        `Warm regards,\n` +
        `The Photocrew Pictures Team\n` +
        `https://www.photocrewpictures.com/`;

      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    } catch (err: any) {
      showToastMsg("Failed to open email client.", "error");
    }
  };

  const renderQuotationAndStep4Section = (isEdit: boolean) => {
    const activePkgs = getSelectedPkgsInfo(isEdit);
    const basePkgSum = dynamicBaseSum;
    const finalAmt = dynamicFinalAmt;
    const pkgNames = activePkgs.map(p => p.package_name).join(' + ') || 'Selected Package';

    const budgetValue = isEdit ? wizardLeadData.budget : createForm.budget;
    const setBudget = (val: number | '') => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, budget: val === '' ? 0 : val }));
      } else {
        setCreateForm(prev => ({ ...prev, budget: val }));
      }
    };

    const remarksValue = isEdit ? wizardLeadData.remarks : createForm.remarks;
    const setRemarks = (val: string) => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, remarks: val }));
      } else {
        setCreateForm(prev => ({ ...prev, remarks: val }));
      }
    };

    const notesValue = isEdit ? wizardLeadData.notes : internalNotes;
    const setNotes = (val: string) => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, notes: val }));
      } else {
        setInternalNotes(val);
      }
    };

    const followUpValue = isEdit ? wizardLeadData.next_follow_up_date : followUpDate;
    const setFollowUp = (val: string) => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, next_follow_up_date: val }));
      } else {
        setFollowUpDate(val);
      }
    };

    const leadValue = isEdit ? wizardLeadData.lead_value : createForm.lead_value;
    const setLeadValue = (val: number | '') => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, lead_value: val === '' ? 0 : val }));
      } else {
        setCreateForm(prev => ({ ...prev, lead_value: val }));
      }
    };

    const leadScore = isEdit ? wizardLeadData.lead_score : createForm.lead_score;
    const setLeadScore = (val: number | '') => {
      if (isEdit) {
        setWizardLeadData(prev => ({ ...prev, lead_score: val === '' ? 0 : val }));
      } else {
        setCreateForm(prev => ({ ...prev, lead_score: val }));
      }
    };

    return (
      <div className="space-y-6">
        {/* Quotation Details */}
        <div className="bg-slate-900/50 border border-slate-805/40 rounded-xl p-4.5 space-y-3.5 shadow-sm">
          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <span>📋</span> Quotation Details
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Package Amount (Editable Package Base Price) */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5 font-mono">
                <span>💰</span> Package Base Price (₹)
              </label>
              <input
                type="number"
                id={isEdit ? "input_section2_package_base_price" : "create_section2_package_base_price"}
                value={wizardLeadData.package_cost !== undefined && wizardLeadData.package_cost !== null ? wizardLeadData.package_cost : (basePkgSum !== undefined ? basePkgSum : '')}
                onChange={(e) => {
                  const rawVal = e.target.value;
                  const parsedNum = rawVal === '' ? 0 : Number(rawVal);
                  const currentPkg = wizardLeadData.selected_package_id || 'Custom Package';
                  setWizardLeadData(prev => ({
                    ...prev,
                    package_cost: rawVal,
                    package_price: parsedNum,
                    budget: parsedNum,
                    final_quoted_amount: parsedNum
                  }));
                  if (currentPkg) {
                    setPkgPrices(prev => ({ ...prev, [currentPkg]: parsedNum }));
                  }
                }}
                onBlur={(e) => {
                  const rawVal = e.target.value;
                  const parsedNum = rawVal === '' ? 0 : Number(rawVal);
                  const currentPkg = wizardLeadData.selected_package_id || 'Custom Package';
                  saveStep3DataRealtime(editableInclusions, editableDeliverables, currentPkg, parsedNum);
                }}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg py-2 px-3 text-xs text-amber-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>

            {/* Discount */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Quotation Discount (₹)
              </label>
              <input
                type="number"
                value={quoteDiscount || ''}
                onChange={(e) => {
                  const rawVal = e.target.value;
                  const discNum = rawVal === '' ? 0 : Number(rawVal);
                  setQuoteDiscount(rawVal === '' ? 0 : discNum);
                  const currentPkg = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || 'Custom Package';
                  saveStep3DataRealtime(editableInclusions, editableDeliverables, currentPkg, undefined, discNum, quoteAdditional);
                }}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono transition-all"
              />
            </div>

            {/* Additional Services Cost - Hidden per user request */}
            <div className="hidden">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Additional Services Cost (₹)
              </label>
              <input
                type="number"
                value={quoteAdditional || ''}
                onChange={(e) => {
                  const rawVal = e.target.value;
                  const addNum = rawVal === '' ? 0 : Number(rawVal);
                  setQuoteAdditional(rawVal === '' ? 0 : addNum);
                  const currentPkg = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || 'Custom Package';
                  saveStep3DataRealtime(editableInclusions, editableDeliverables, currentPkg, undefined, quoteDiscount, addNum);
                }}
                placeholder="0"
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 font-mono transition-all"
              />
            </div>

            {/* Extra Charges */}

          </div>

          {/* Final Calculated Amount Badge */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-inner mt-2">
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide font-mono">Final Quotation Amount</p>
              <p className="text-[9px] text-slate-500 font-mono">Formula: Base Price (₹{basePkgSum}) - Disc (₹{quoteDiscount || 0})</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-extrabold text-amber-500 font-mono">
                ₹{finalAmt.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Payment Summary & Update Payment Action */}
          {(() => {
            const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || '');
            const activeLead = selectedLead || leads?.find(l => l.lead_id === currentLeadId);
            const linkedOrder = orders?.find(o => currentLeadId && o.lead_id === currentLeadId);
            const resolvedOrderId = selectedLead?.order_id || (selectedLead as any)?.Order_ID || linkedOrder?.order_id || (activeLead as any)?.order_id || wizardLeadData.order_id || currentLeadId || '';
            const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : payments?.find(p => (resolvedOrderId && p.order_id === resolvedOrderId) || (currentLeadId && p.lead_id === currentLeadId));

            const orderHistories = (paymentHistory || []).filter((h: any) => {
              if (!h.order_id) return false;
              if (resolvedOrderId && h.order_id === resolvedOrderId) return true;
              if (linkedOrder?.order_id && h.order_id === linkedOrder.order_id) return true;
              if (currentLeadId && (h.order_id === currentLeadId || h.order_id === `ORD-${currentLeadId}`)) return true;
              return false;
            });

            const approvedHistories = orderHistories.filter((h: any) => h.approval_status === 'Approved');
            const pendingApprovalHistories = orderHistories.filter((h: any) => h.approval_status === 'Waiting for Approval');

            let approvedAmount = approvedHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
            let pendingApprovalAmount = pendingApprovalHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);

            const advanceReceived = linkedOrder ? (Number(linkedOrder.advance_received) || 0) : ((activeLead?.advance_collected !== undefined && activeLead?.advance_collected !== null && activeLead?.advance_collected !== '') ? Number(activeLead.advance_collected) : 0);

            if (orderHistories.length === 0) {
              if (linkedPayment?.payment_status === 'Waiting for Approval') {
                pendingApprovalAmount = (Number(linkedPayment.advance_received) || 0) + (Number(linkedPayment.final_payment_received) || 0) + (Number(linkedPayment.additional_received) || 0) || advanceReceived;
              } else {
                approvedAmount = linkedPayment
                  ? ((Number(linkedPayment.advance_received) || 0) + (Number(linkedPayment.final_payment_received) || 0) + (Number(linkedPayment.additional_received) || 0))
                  : advanceReceived;
              }
            }

            const totalPaymentReceived = approvedAmount + pendingApprovalAmount;
            const totalPendingAmount = Math.max(0, finalAmt - totalPaymentReceived);

            const isOrderConfirmed = Boolean(
              isLeadConfirmed ||
              wizardLeadData.status === 'Order Confirmed' ||
              salesStatus === 'Order Confirmed' ||
              (activeLead && ['Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(activeLead.status || '')) ||
              (activeLead && (activeLead as any).current_status === 'Order Confirmed') ||
              (activeLead && (activeLead as any).booking_status === 'Confirmed') ||
              (linkedOrder && linkedOrder.status !== 'Cancelled') ||
              (orders && orders.some(o => (currentLeadId && o.lead_id === currentLeadId && o.status !== 'Cancelled') || (resolvedOrderId && o.order_id === resolvedOrderId && o.status !== 'Cancelled')))
            );

            return (
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-inner">
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">TOTAL PAYMENT</p>
                    <p className="text-sm font-extrabold text-emerald-400 font-mono mt-0.5">
                      ₹{totalPaymentReceived.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">TOTAL PENDING</p>
                    <p className={`text-sm font-extrabold font-mono mt-0.5 ${totalPendingAmount === 0 ? 'text-emerald-400' : 'text-rose-450'}`}>
                      ₹{totalPendingAmount.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                {isOrderConfirmed && (
                  <button
                    type="button"
                    id="btn_step3_update_payment"
                    onClick={() => setShowStep3PaymentModal(true)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono text-xs font-bold uppercase tracking-wider rounded-lg shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <span>💳</span>
                    <span>UPDATE PAYMENT</span>
                  </button>
                )}
              </div>
            );
          })()}

          {/* Update Payment Modal */}
          <UpdatePaymentModal
            isOpen={showStep3PaymentModal}
            onClose={() => setShowStep3PaymentModal(false)}
            record={(() => {
              const currentLeadId = isEdit ? (selectedLead?.lead_id || wizardLeadData.lead_id) : (selectedLead?.lead_id || createForm.lead_id || '');
              const activeLead = selectedLead || leads?.find(l => l.lead_id === currentLeadId);
              const linkedOrder = orders?.find(o => currentLeadId && o.lead_id === currentLeadId);
              const resolvedOrderId = selectedLead?.order_id || (selectedLead as any)?.Order_ID || linkedOrder?.order_id || (activeLead as any)?.order_id || wizardLeadData.order_id || currentLeadId || '';
              const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : payments?.find(p => (resolvedOrderId && p.order_id === resolvedOrderId) || (currentLeadId && p.lead_id === currentLeadId));

              const orderHistories = (paymentHistory || []).filter((h: any) => {
                if (!h.order_id) return false;
                if (resolvedOrderId && h.order_id === resolvedOrderId) return true;
                if (linkedOrder?.order_id && h.order_id === linkedOrder.order_id) return true;
                if (currentLeadId && (h.order_id === currentLeadId || h.order_id === `ORD-${currentLeadId}`)) return true;
                return false;
              });

              const approvedHistories = orderHistories.filter((h: any) => h.approval_status === 'Approved');
              const pendingApprovalHistories = orderHistories.filter((h: any) => h.approval_status === 'Waiting for Approval');

              let approvedAmount = approvedHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);
              let pendingApprovalAmount = pendingApprovalHistories.reduce((sum: number, h: any) => sum + (Number(h.amount) || 0), 0);

              const advanceReceived = linkedOrder ? (Number(linkedOrder.advance_received) || 0) : ((activeLead?.advance_collected !== undefined && activeLead?.advance_collected !== null && activeLead?.advance_collected !== '') ? Number(activeLead.advance_collected) : 0);

              if (orderHistories.length === 0) {
                if (linkedPayment?.payment_status === 'Waiting for Approval') {
                  pendingApprovalAmount = (Number(linkedPayment.advance_received) || 0) + (Number(linkedPayment.final_payment_received) || 0) + (Number(linkedPayment.additional_received) || 0) || advanceReceived;
                } else {
                  approvedAmount = linkedPayment
                    ? ((Number(linkedPayment.advance_received) || 0) + (Number(linkedPayment.final_payment_received) || 0) + (Number(linkedPayment.additional_received) || 0))
                    : advanceReceived;
                }
              }

              const totalPaymentReceived = approvedAmount + pendingApprovalAmount;
              const totalPendingAmount = Math.max(0, finalAmt - totalPaymentReceived);

              return {
                orderId: resolvedOrderId,
                lead: activeLead || { lead_id: currentLeadId, order_id: resolvedOrderId },
                finalPackageAmount: finalAmt,
                totalPaidAmount: totalPaymentReceived,
                remainingAmount: totalPendingAmount,
                payment: linkedPayment
              };
            })()}
            onSuccess={() => {
              if (refreshData) {
                refreshData();
              }
            }}
          />

          {/* Action buttons directly under Quotation Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-slate-800/60">
            {/* Download PDF */}
            <button
              type="button"
              onClick={() => handleDownloadQuotePDF(isEdit)}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-red-950/40 hover:bg-red-900/50 text-red-300 rounded-lg transition-all border border-red-900/40 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>📄</span> {isSaving ? 'Processing...' : 'Download PDF Document'}
            </button>

            {/* Send WhatsApp */}
            <button
              type="button"
              onClick={() => handleSendWhatsAppQuote(isEdit)}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 rounded-lg transition-all border border-emerald-900/40 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>💬</span> {isSaving ? 'Processing...' : 'Send Quotation via WhatsApp'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderStep3Workspace = (isEdit: boolean) => {
    const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
    const rawPkgId = isEdit
      ? (wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option || '')
      : (wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedPkgIds[0] || '');
    const currentPkgId = (rawPkgId && rawPkgId.trim() !== '') ? rawPkgId : 'Custom Package';

    let selectedPkg = availablePkgs.find(p => String(p.package_id) === String(currentPkgId) || String(p.package_name) === String(currentPkgId));
    if (!selectedPkg && currentPkgId) {
      selectedPkg = {
        package_id: currentPkgId,
        package_name: (currentPkgId === 'custom_package' || currentPkgId === 'Custom Package') ? 'Custom Package' : `Package ${currentPkgId}`,
        price: wizardLeadData.package_cost || 0,
        deliverables: wizardLeadData.deliverables || "",
        status: "Active"
      } as any;
    }
    const selectedPkgId = selectedPkg?.package_id || 'Custom Package';
    const rawEvents = isEdit ? crmEvents : createEvents;
    const currentEvents = sortEventsAscending(rawEvents);
    const isMulti = currentEvents && currentEvents.length > 1;
    const inclusionsList = (!isMulti && (editableInclusions[selectedPkgId] || editableInclusions['Custom Package'] || editableInclusions['custom_package'])) || [];
    const deliverablesList = (!isMulti && (editableDeliverables[selectedPkgId] || editableDeliverables['Custom Package'] || editableDeliverables['custom_package'])) || [];

    return (
      <div className="space-y-4 animate-fade-in text-left">
        <div className="space-y-3.5 text-left">
          <div className="flex items-center justify-between">
            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase font-mono tracking-wider">Select Package Option *</label>
            {step3AutoSaveStatus === 'saving' && (
              <span className="text-[10px] text-amber-400 font-mono font-semibold animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                Saving...
              </span>
            )}
            {step3AutoSaveStatus === 'saved' && (
              <span className="text-[10px] text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Saved ✓
              </span>
            )}
            {step3AutoSaveStatus === 'error' && (
              <span className="text-[10px] text-red-400 font-mono font-semibold flex items-center gap-1">
                Save failed
              </span>
            )}
          </div>
          <SearchablePackageSelect
            id="select_package_option"
            value={currentPkgId}
            onChange={(val) => {
              setSelectedPkgIds([val]);
              handlePackageDropdownChange(val);
            }}
            packages={availablePkgs}
            isLocked={isStep3Locked}
          />
          </div>

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
                  id={isEdit ? "input_sales_staff_name" : "wizard_sales_staff_name"}
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
                  id={isEdit ? "input_sales_staff_mobile" : "wizard_sales_staff_mobile"}
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

          {/* Single Package Base Price (₹) Field (Hidden visually per request, keeping value intact internally) */}
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
                saveStep3DataRealtime(editableInclusions, editableDeliverables, wizardLeadData.selected_package_id || wizardLeadData.selected_package_id, numVal);
              }}
              placeholder="Enter package base price..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:outline-none rounded-lg py-1.5 px-3 text-xs text-amber-300 font-mono font-bold"
              required
            />
          </div>

          {/* Event-Wise Configuration or Single Configuration */}
          <div>
            {currentEvents && currentEvents.length > 0 ? (() => {
              const isMulti = currentEvents.length > 1;
              return currentEvents.map((event, eventIdx) => {
                const evId = String(event.id || event.event_id || `EV-${eventIdx + 1}`);
                const evAltId = String(event.event_id || event.id || `EVT-0${eventIdx + 1}`);
                const evIdxKey = `EV-${eventIdx + 1}`;
                const eventKey = `${selectedPkgId}_${evId}`;
                const altKey = `Custom Package_${evId}`;
                const customKey = `custom_package_${evId}`;

                const directTm = event.team_members || event.inclusions || event.Team_Members || event.team_members_included;
                const parsedDirectTm = directTm ? (Array.isArray(directTm) ? directTm.map((m: any) => {
                  const { qty, text } = parseQtyAndText(m);
                  return text ? combineQtyAndText(qty, text) : '';
                }).filter(Boolean) : null) : null;

                const rawInclusions = editableInclusions[eventKey] !== undefined
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
                const eventInclusions = normalizeCrmArray<string>(rawInclusions);

                const directDel = event.deliverables || event.deliverables_list || event.Add_Deliverable || event.deliverables_description;
                const parsedDirectDel = directDel ? (Array.isArray(directDel) ? directDel.map((d: any) => {
                  const { qty, text } = parseQtyAndText(d);
                  return text ? combineQtyAndText(qty, text) : '';
                }).filter(Boolean) : null) : null;

                const rawDeliverables = editableDeliverables[eventKey] !== undefined
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
                const eventDeliverables = normalizeCrmArray<string>(rawDeliverables);

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
                const guestPaxVal = String(event.guest_pax) !== '' && event.guest_pax !== null && event.guest_pax !== undefined ? event.guest_pax : 'N/A';
                const specificEventLocation = (event.event_location || (event as any).location || (event as any).venue_address || (event as any).venue || (event as any).event_venue || '').trim();
                const eventLocationDisplay = specificEventLocation || (!isMulti ? (wizardLeadData.event_location || selectedLead?.event_location || 'N/A') : 'N/A');
                const isEventLocked = isCrmLocked || checkIsEventEnded(event);

                return (
                  <div key={evId} className="bg-slate-900/25 border border-slate-800/60 p-4 rounded-xl space-y-4 mt-3 mb-4">
                    {/* Locked Event Notice */}
                    {isEventLocked && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-mono font-bold flex items-center gap-2">
                        <span>🔒</span>
                        <span>Event has ended. This event is locked.</span>
                      </div>
                    )}

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
                        {isEventLocked && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                            <span>🔒</span>
                            <span>Event has ended. This event is locked.</span>
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
                          {!isEventLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                const currentList = [...eventInclusions, ""];
                                updateInclusionsForEvent(currentList);
                              }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                            >
                              + Add Member
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {eventInclusions.map((item, idx) => (
                            <CompactQtyItemRow
                              key={`inc_ev_${evId}_${idx}`}
                              value={item}
                              disabled={isEventLocked}
                              options={activeMasterRoles}
                              placeholder="Type or select Role / Team Member..."
                              accentColor="indigo"
                              onChange={(newVal) => {
                                if (isEventLocked) return;
                                const currentList = [...eventInclusions];
                                currentList[idx] = newVal;
                                updateInclusionsForEvent(currentList);
                              }}
                              onDelete={() => {
                                if (isEventLocked) return;
                                const currentList = [...eventInclusions];
                                currentList.splice(idx, 1);
                                updateInclusionsForEvent(currentList);
                              }}
                            />
                          ))}
                          {!isEventLocked && (
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const currentList = [...eventInclusions, ""];
                                  updateInclusionsForEvent(currentList);
                                }}
                                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold font-mono bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md border border-indigo-500/20 transition-all cursor-pointer"
                              >
                                + Add Member
                              </button>
                            </div>
                          )}
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
                          {!isEventLocked && (
                            <button
                              type="button"
                              onClick={() => {
                                const currentList = [...eventDeliverables, ""];
                                updateDeliverablesForEvent(currentList);
                              }}
                              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                            >
                              + Add Deliverable
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {eventDeliverables.map((item, idx) => (
                            <CompactQtyItemRow
                              key={`del_ev_${evId}_${idx}`}
                              value={item}
                              disabled={isEventLocked}
                              options={activeMasterDeliverables}
                              placeholder="Type or select Deliverable..."
                              accentColor="emerald"
                              onChange={(newVal) => {
                                if (isEventLocked) return;
                                const currentList = [...eventDeliverables];
                                currentList[idx] = newVal;
                                updateDeliverablesForEvent(currentList);
                              }}
                              onDelete={() => {
                                if (isEventLocked) return;
                                const currentList = [...eventDeliverables];
                                currentList.splice(idx, 1);
                                updateDeliverablesForEvent(currentList);
                              }}
                            />
                          ))}
                          {!isEventLocked && (
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const currentList = [...eventDeliverables, ""];
                                  updateDeliverablesForEvent(currentList);
                                }}
                                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold font-mono bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-md border border-emerald-500/20 transition-all cursor-pointer"
                              >
                                + Add Deliverable
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })() : (
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

                {/* Single Deliverables */}
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
            )}
          </div>

        <div className="mt-4 flex justify-end pb-2">
          <button
            type="button"
            onClick={handleSavePackageOnly}
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-lg shadow transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving Package...' : 'Save Package'}
          </button>
        </div>

        {renderQuotationAndStep4Section(isEdit)}
      </div>
    );
  };

  useEffect(() => {
    let isMounted = true;

    const fetchReportingData = async () => {
       if (!selectedLead?.lead_id) return;
       try {
          if (!supabaseClient) return;
          const { data, error } = await supabaseClient
             .from('order_event_reporting')
             .select('*')
             .eq('lead_id', selectedLead.lead_id);
          
          if (error) {
             console.error("Failed to load order_event_reporting data", error);
             return;
          }

          if (isMounted && data && data.length > 0) {
             const first = data[0];
             setWizardLeadData(prev => ({
                ...prev,
                confirmed_event_date: first.confirmed_event_date || prev.confirmed_event_date,
                confirmed_event_time: first.confirmed_event_time || prev.confirmed_event_time,
                final_amount: first.contract_final_amount || prev.final_amount,
                advance_received: (first.advance_payment_received !== undefined && first.advance_payment_received !== null && first.advance_payment_received !== '') ? Number(first.advance_payment_received) : prev.advance_received,
             }));

             setCrmEvents(prev => prev.map(ev => {
                const rep = data.find(r => r.event_id === ev.id);
                if (rep) {
                   return {
                      ...ev,
                      reporting_date: rep.reporting_date || ev.reporting_date,
                      reporting_time: rep.reporting_time || ev.reporting_time
                   };
                }
                return ev;
             }));
          }
       } catch (err) {
          console.error("Error loading reporting data", err);
       }
    };

    fetchReportingData();
    
    return () => { isMounted = false; };
  }, [selectedLead?.lead_id, supabaseClient]);

  // Sync wizardLeadData.advance_received and wizardLeadData.final_amount with latest payment and order confirmation data
  const prevSyncedLeadIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!selectedLead?.lead_id) {
      prevSyncedLeadIdRef.current = null;
      return;
    }
    if (prevSyncedLeadIdRef.current === selectedLead.lead_id) return;
    prevSyncedLeadIdRef.current = selectedLead.lead_id;
    const linkedOrder = orders?.find(o => o.lead_id === selectedLead.lead_id);
    const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : payments?.find(p => p.lead_id === selectedLead.lead_id);
    
    if (linkedOrder || linkedPayment || (paymentHistory && paymentHistory.length > 0)) {
      setWizardLeadData(prev => {
        const historyPaid = (paymentHistory || []).filter((h: any) => ((linkedOrder && h.order_id === linkedOrder.order_id) || (selectedLead?.lead_id && h.order_id === selectedLead.lead_id)) && h.approval_status !== 'Rejected').reduce((acc: number, h: any) => acc + (Number(h.amount) || 0), 0);
        const payTotal = linkedPayment ? ((Number(linkedPayment.advance_received) || 0) + (Number(linkedPayment.final_payment_received) || 0) + (Number(linkedPayment.additional_received) || 0)) : (linkedOrder ? (Number(linkedOrder.advance_received) || 0) : prev.advance_received);
        const latestAdvance = Math.max(payTotal, historyPaid);
        const latestFinalAmount = Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_quotation_amount) || (linkedOrder ? (linkedOrder.quotation_amount || 0) : prev.final_amount);
        
        return {
          ...prev,
          advance_received: latestAdvance,
          final_amount: latestFinalAmount
        };
      });
    }
  }, [selectedLead?.lead_id]);

  // Handle lead select
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.role === 'sales' || e.detail?.role === 'owner' || !e.detail?.role) {
        const leadId = e.detail?.leadId || e.detail?.lead_id;
        const orderId = e.detail?.orderId || e.detail?.order_id;
        const targetLead = leads.find(
          l => (leadId && (l.lead_id === leadId || l.order_id === leadId)) ||
               (orderId && (l.lead_id === orderId || l.order_id === orderId)) ||
               (l.events && l.events.some(ev => ev.id === leadId || ev.id === orderId))
        );
        if (targetLead) {
          handleSelectLead(targetLead);
        }
      }
    };
    window.addEventListener('calendar-action-click-deferred', handler);
    window.addEventListener('calendar-action-click', handler);
    return () => {
      window.removeEventListener('calendar-action-click-deferred', handler);
      window.removeEventListener('calendar-action-click', handler);
    };
  }, [leads]);
  
  const handleSelectLead = async (lead: Lead, targetStep?: number) => {
    let fullLead = lead;
    if (supabaseClient && lead.lead_id && lead.lead_id !== 'DRAFT-LEAD') {
      try {
        const { data: dbLead, error: dbLeadErr } = await supabaseClient
          .from('leads')
          .select('*')
          .eq('lead_id', lead.lead_id)
          .maybeSingle();
        
        if (!dbLeadErr && dbLead) {
          const directLostReason = dbLead.Lost_Reason || dbLead.lost_reason || lead.Lost_Reason || (lead as any).lost_reason || '';
          const directLostNotes = dbLead.Lost_Notes || dbLead.lost_notes || lead.Lost_Notes || (lead as any).lost_notes || '';
          fullLead = {
            ...lead,
            ...dbLead,
            Select_Package_Option: dbLead.Select_Package_Option || lead.Select_Package_Option,
            selected_package_id: dbLead.selected_package_id || lead.selected_package_id,
            Final_Quotation_Amount: dbLead.Final_Quotation_Amount || lead.Final_Quotation_Amount,
            Final_Package_Amount: dbLead.Final_Package_Amount || lead.Final_Package_Amount,
            final_package_amount: (dbLead as any).final_package_amount || (lead as any).final_package_amount,
            budget: dbLead.budget || lead.budget,
            events: (dbLead.events && Array.isArray(dbLead.events) && dbLead.events.length > 0) ? dbLead.events : (lead.events || []),
            Lost_Reason: directLostReason,
            lost_reason: directLostReason,
            Lost_Notes: directLostNotes,
            lost_notes: directLostNotes
          };
        }
      } catch (err) {
        console.warn("Failed to fetch full lead details on select", err);
      }
    }

    // If lost lead, ensure clean reason and notes without dirty metadata
    if (['Lost Lead', 'Lead Lost', 'Lost'].includes(fullLead.status || (fullLead as any).current_status || '')) {
      const { reason: cleanR, notes: cleanN } = getStrictLostReasonAndNotes(fullLead);
      fullLead.Lost_Reason = cleanR;
      fullLead.lost_reason = cleanR;
      fullLead.Lost_Notes = cleanN;
      fullLead.lost_notes = cleanN;
    }

    setSelectedLead(fullLead);
    const initialEvents = normalizeCrmArray<LeadEvent>(fullLead.events);
    setCrmEvents(initialEvents);

    // Always fetch fresh events to ensure no cached EV- IDs are used
    let eventsForCheck = initialEvents;
    if (supabaseClient && fullLead.lead_id && fullLead.lead_id !== 'DRAFT-LEAD') {
      try {
        const { data: freshEvents, error } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', fullLead.lead_id)
          .order('created_at', { ascending: true });
        
        if (!error && freshEvents && freshEvents.length > 0) {
          setCrmEvents(freshEvents as LeadEvent[]);
          eventsForCheck = freshEvents as LeadEvent[];
          setSelectedLead(prev => prev ? { ...prev, events: freshEvents as LeadEvent[] } : prev);
        }
      } catch (err) {
        console.warn("Failed to load fresh events on selection", err);
      }
    }

    setGeneratedPDFBlobUrl('');
    setActiveQuoteNum('');
    setQuoteDiscount(0);
    setQuoteAdditional(0);
    // Explicitly reset only when switching to a different lead ID
    if (!selectedLead || selectedLead.lead_id !== lead.lead_id) {
      setEditableInclusions({});
      setEditableDeliverables({});
      lastLoadedLeadIdRef.current = null;
    }
    // Clean and set Sales Executive Details (isolated from Operations/Production staff on events)
    const initialSalesStaffName = getCleanSalesStaffName(lead.sales_staff_name, lead);
    const initialSalesStaffMobile = getCleanSalesStaffMobile(lead.sales_staff_mobile, lead);
    setSalesStaffName(initialSalesStaffName);
    setSalesStaffMobile(initialSalesStaffMobile);

    const activePackages = (leadPackages || []).filter(lp => lp.lead_id === lead.lead_id);
    const primaryLP = activePackages[0];
    
    // Find the latest quotation for this lead if it exists
    const latestQuote = [...(quotations || [])]
      .filter(q => q.lead_id === lead.lead_id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

    // Determine the target CRM step based on persisted data and status
    const hasQuotationOrPackage = !!(
      latestQuote ||
      primaryLP?.package_id ||
      (fullLead.Select_Package_Option && String(fullLead.Select_Package_Option).trim() !== '') ||
      ['Quotation Sent', 'Negotiation', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed', 'Lost Lead'].includes(fullLead.status || '') ||
      ['Quotation Sent', 'Negotiation', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed', 'Lost Lead'].includes((fullLead as any).current_status || '')
    );

    const hasCustomerDetails = !!(
      (fullLead.customer_name && String(fullLead.customer_name).trim() !== '') ||
      (fullLead.mobile && String(fullLead.mobile).trim() !== '')
    );

    const localSavedStep = localStorage.getItem(`crm_last_step_${lead.lead_id}`);
    const remarksMatch = fullLead.remarks?.match(/\[CRM_COMPLETED_STEP:\s*(\d+)\]/);
    const localStepVal = localSavedStep && !isNaN(parseInt(localSavedStep, 10)) ? parseInt(localSavedStep, 10) : 0;
    const remarksStepVal = remarksMatch && !isNaN(parseInt(remarksMatch[1], 10)) ? parseInt(remarksMatch[1], 10) : 0;
    const explicitStep = Math.max(localStepVal, remarksStepVal) || null;

    const isConfirmedLead = ['Confirm Order', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed'].includes(fullLead.status || '') || (fullLead as any).current_status === 'Order Confirmed' || (fullLead as any).booking_status === 'Confirmed' || orders.some(o => o.lead_id === fullLead.lead_id && o.status !== 'Cancelled');
    const isUnlockedLead = unlockRequests.some(r => (r.lead_id === fullLead.lead_id || r.order_id === fullLead.lead_id || r.project_id === fullLead.lead_id) && (r.status === 'Approved' || r.request_status === 'Approved')) || unlockedRecords.some(r => r.recordId === fullLead.lead_id && r.module === 'Sales');

    // Navigation logic: always open first incomplete step. If lead is unlocked, open Step 3.
    let startStep = 1;
    if (isConfirmedLead && isUnlockedLead) {
      startStep = 3;
    } else if (explicitStep) {
      if (explicitStep >= 2) startStep = 3;
      else if (explicitStep === 1) startStep = 2;
    } else {
      if (hasQuotationOrPackage) startStep = 3;
      else if (hasCustomerDetails) startStep = 2;
      else startStep = 1;
    }

    const finalStep = targetStep || startStep;
    const completedStep = Math.max(finalStep === 3 ? 3 : (startStep === 3 ? (hasQuotationOrPackage ? 3 : 2) : startStep - 1), explicitStep || 1);
    setCrmHighestStep(completedStep);
    setCrmWizardStep(finalStep);
    
    const hasPackageAnywhere = !!(lead.Select_Package_Option || primaryLP?.package_id || latestQuote?.package_id);
    if (completedStep >= 3 || hasPackageAnywhere) {
    } else {
    }

    setQuoteDiscount(fullLead.Quotation_Discount ?? latestQuote?.discount_amount ?? 0);
    setQuoteAdditional(fullLead.Additional_Services_Cost ?? latestQuote?.additional_services_cost ?? 0);
    if (latestQuote) {
      setActiveQuoteNum(latestQuote.quotation_number || '');
      const quoteSalesName = getCleanSalesStaffName(latestQuote.sales_staff_name || lead.sales_staff_name, lead);
      const quoteSalesMobile = getCleanSalesStaffMobile(latestQuote.sales_staff_mobile || lead.sales_staff_mobile, lead);
      setSalesStaffName(quoteSalesName);
      setSalesStaffMobile(quoteSalesMobile);
    }

    const matchedPkgId = fullLead.Select_Package_Option || latestQuote?.package_id || primaryLP?.package_id || 'Custom Package';
    const matchedPkg = (packages || []).find(p => p.package_id === matchedPkgId);
    const effectiveEvents = eventsForCheck && eventsForCheck.length > 0 ? eventsForCheck : normalizeCrmArray<LeadEvent>(fullLead.events || crmEvents);

    // 1. Load Deliverables
    const rawDelData = fullLead.Add_Deliverable || primaryLP?.deliverables_descriptionn || primaryLP?.editable_deliverables || fullLead.deliverables_description || latestQuote?.deliverables_description || matchedPkg?.deliverables;
    if (rawDelData || (effectiveEvents && effectiveEvents.length > 0)) {
      const newDeliverables = parseDeliverablesJsonToRecord(rawDelData, matchedPkgId, effectiveEvents);
      setEditableDeliverables(newDeliverables);
    } else {
      setEditableDeliverables({});
    }

    // 2. Load Team Members
    const rawTeamData = fullLead.Team_Members || fullLead.Team_member || (fullLead as any)?.team_members || primaryLP?.Team_Members_Included || primaryLP?.editable_inclusions || matchedPkg?.team_members;
    console.log('TEAM MEMBERS LOADED in openCRMModal', { leadId: fullLead.lead_id, Team_Members: rawTeamData });
    if (rawTeamData || (effectiveEvents && effectiveEvents.length > 0)) {
      const newInclusions = parseTeamMembersJsonToRecord(rawTeamData, matchedPkgId, effectiveEvents);
      setEditableInclusions(newInclusions);
    } else {
      setEditableInclusions({});
    }

    const firstEvent = fullLead.events && fullLead.events.length > 0 ? fullLead.events[0] : null;
    const evName = firstEvent?.event_name || fullLead.custom_event_name || '';
    const evShootType = firstEvent?.event_shoot_type || fullLead.desired_event_shoot_type || fullLead.shoot_type || '';
    const evDate = firstEvent?.event_date || fullLead.event_date || '';
    const evStartDate = firstEvent?.event_start_date || fullLead.event_date || '';
    const evEndDate = firstEvent?.event_end_date || (firstEvent as any)?.Event_End_Date || fullLead.Event_End_Date || '';
    const evLocation = firstEvent?.event_location || fullLead.event_location || '';
    const evGuestPax = firstEvent?.guest_pax ?? fullLead.guest_pax ?? fullLead.total_pax ?? '';
    const evStaffPax = firstEvent?.staff_pax ?? fullLead.staff_pax ?? '';
    setInternalNotes(fullLead.follow_up_notes || '');
    setFollowUpDate(fullLead.next_follow_up_date || '');
    
    const cleanPkgPrice = (fullLead.package_price && Number(fullLead.package_price) > 0)
      ? Number(fullLead.package_price)
      : ((primaryLP?.package_cost && Number(primaryLP.package_cost) > 0)
        ? Number(primaryLP.package_cost)
        : ((latestQuote?.package_price && Number(latestQuote.package_price) > 0)
          ? Number(latestQuote.package_price)
          : (fullLead.budget && Number(fullLead.budget) > 0
            ? Number(fullLead.budget)
            : (matchedPkg ? Number(matchedPkg.price) : 0))));
    
    setWizardLeadData({
      customer_name: fullLead.customer_name || '',
      mobile: fullLead.mobile ? String(fullLead.mobile) : '',
      whatsapp_number: fullLead.whatsapp_number ? String(fullLead.whatsapp_number) : (fullLead.mobile ? String(fullLead.mobile) : ''),
      email: fullLead.email || '',
      address: fullLead.address || '',
      city: latestQuote?.city || fullLead.city || '',
      state: latestQuote?.state || fullLead.state || '',
      pincode: latestQuote?.pincode || fullLead.pincode || '',
      client_residence_address: latestQuote?.client_residence_address || fullLead.client_residence_address || '',
      desired_event_shoot_type: latestQuote?.desired_event_shoot_type || fullLead.desired_event_shoot_type || '',
      // Step 2
      event_type: fullLead.event_type || '',
      custom_event_name: fullLead.custom_event_name || '',
      event_name: evName,
      event_event_shoot_type: evShootType,
      event_date: evDate,
      event_start_date: evStartDate,
      event_end_date: evEndDate,
      event_time: fullLead.event_time || '',
      reporting_time: fullLead.reporting_time || '',
      event_location: evLocation,
      guest_pax: evGuestPax,
      staff_pax: evStaffPax,
      lead_source: fullLead.lead_source || '',
      Specify_Custom_Lead_Source_Name: fullLead.Specify_Custom_Lead_Source_Name || '',
      event_shoot_type: evShootType,
      // Step 3
      selected_package_id: matchedPkgId || 'Custom Package',
      package_cost: cleanPkgPrice || '',
      package_price: cleanPkgPrice || '',
      deliverables: typeof rawDelData === 'string' ? rawDelData : JSON.stringify(rawDelData || ''),
      deliverables_description: typeof rawDelData === 'string' ? rawDelData : JSON.stringify(rawDelData || ''),
      notes_special_customizations: fullLead.notes_special_customizations || latestQuote?.notes_special_customizations || primaryLP?.notes_special_customizations || '',
      notes: fullLead.remarks || '',
      // Step 4
      budget: cleanPkgPrice || fullLead.budget || latestQuote?.quotation_amount || 0,
      final_quoted_amount: fullLead.Final_Quotation_Amount ?? latestQuote?.final_amount ?? (primaryLP ? Number(primaryLP.final_amount) : 0),
      remarks: fullLead.remarks || '',
      next_follow_up_date: '',
      // Step 5
      status: fullLead.status || 'New Lead',
      Lost_Reason: fullLead.Lost_Reason || (fullLead as any).lost_reason || '',
      lost_reason: fullLead.lost_reason || fullLead.Lost_Reason || '',
      Lost_Notes: fullLead.Lost_Notes || (fullLead as any).lost_notes || '',
      lost_notes: fullLead.lost_notes || fullLead.Lost_Notes || '',
      // Order Confirmed Rule fields
      confirmed_event_date: fullLead.booking_date || fullLead.event_date || '',
      confirmed_event_time: fullLead.booking_time || fullLead.event_time || '',
      final_amount: (fullLead.Final_Package_Amount !== null && fullLead.Final_Package_Amount !== undefined && !isNaN(Number(fullLead.Final_Package_Amount)) && Number(fullLead.Final_Package_Amount) > 0)
        ? Number(fullLead.Final_Package_Amount)
        : (Number(fullLead.final_package_amount) || Number(fullLead.Final_Quotation_Amount) || (Number((fullLead as any).final_amount) > 0 ? Number((fullLead as any).final_amount) : 0)),
      advance_received: (fullLead.advance_collected !== undefined && fullLead.advance_collected !== null && fullLead.advance_collected !== '') ? Number(fullLead.advance_collected) : 0,
      total_pax: fullLead.total_pax || 0,
      reference_source: fullLead.reference_source || '',
      lead_value: fullLead.lead_value || 0,
      lead_score: fullLead.lead_score || 0,
      booking_status: fullLead.booking_status || 'Pending',
    });

    setFollowUpForm({
      call_notes: lead.follow_up_notes || '',
      next_follow_up_date: '',
      status: lead.status,
      quotation_amount: 0,
      negotiation_notes: '',
      event_date: lead.event_date || '',
      event_time: lead.event_time || '',
      reporting_time: lead.reporting_time || '08:00',
      advance_received: 0,
      payment_mode: 'UPI',
    });
    const resolvedQuoteAmt = getStep3FinalQuotationAmount(fullLead, {
      dynamicFinalAmt,
      wizardLeadData,
      quotations: allQuotations,
      leads: allLeads,
      orders: allOrders,
      leadPackages
    });
    setConfirmForm({
      package_name: packages?.find((p) => String(p.package_id) === String(lead.Select_Package_Option))?.package_name || lead.Select_Package_Option || '',
      quotation_amount: resolvedQuoteAmt || Number(fullLead.Final_Quotation_Amount) || Number((fullLead as any).final_quotation_amount) || (Number(wizardLeadData.final_amount) > 0 ? Number(wizardLeadData.final_amount) : 0),
      advance_received: 0,
      event_date: lead.event_date || '',
      event_time: lead.event_time || '',
      payment_mode: 'UPI',
      notes: '',
      transaction_id: '',
    });
  };

  const handlePackageDropdownChange = (packageId: string) => {
    if (isStep3Locked) {
      showToastMsg("Quotation details are locked. Owner unlock approval required to edit.", "error");
      return;
    }

    const activeEvents = activeTab === 'create' ? createEvents : crmEvents;
    
    // Auto save by logged in sales user
    if (currentUser) {
      setSalesStaffName(currentUser.name || '');
      setSalesStaffMobile(currentUser.mobile || '');
    }
    
    const targetPkgId = packageId || 'Custom Package';
    setSelectedPkgIds([targetPkgId]);

    if (targetPkgId === 'Custom Package' || targetPkgId === 'custom_package') {
      const customPkgVal = 'Custom Package';
      setWizardLeadData((prev) => ({
        ...prev,
        selected_package_id: customPkgVal,
        Select_Package_Option: customPkgVal,
        package_name: 'Custom Package',
      }));

      const newInclusions = { ...editableInclusions };
      if (!newInclusions[customPkgVal]) newInclusions[customPkgVal] = [];
      const newDeliverables = { ...editableDeliverables };
      if (!newDeliverables[customPkgVal]) newDeliverables[customPkgVal] = [];

      if (activeEvents && activeEvents.length > 0) {
        activeEvents.forEach((ev, idx) => {
          const evId = String(ev.id || ev.event_id || `EV-${idx + 1}`);
          const k1 = `${customPkgVal}_${evId}`;
          const k2 = `custom_package_${evId}`;
          if (!newInclusions[k1]) newInclusions[k1] = [];
          if (!newInclusions[k2]) newInclusions[k2] = [];
          if (!newInclusions[evId]) newInclusions[evId] = [];
          if (!newDeliverables[k1]) newDeliverables[k1] = [];
          if (!newDeliverables[k2]) newDeliverables[k2] = [];
          if (!newDeliverables[evId]) newDeliverables[evId] = [];
        });
      }

      setEditableInclusions(newInclusions);
      setEditableDeliverables(newDeliverables);
      if (selectedLead && selectedLead.lead_id && selectedLead.lead_id !== 'DRAFT-LEAD') {
        saveStep3DataRealtime(newInclusions, newDeliverables, customPkgVal);
      }
      return;
    }

    const availablePkgs = (packages && packages.length > 0) ? packages : INITIAL_PACKAGES;
    const pkg = availablePkgs.find((p) => String(p.package_id) === String(targetPkgId) || String(p.package_name) === String(targetPkgId));
    if (pkg) {
      const pkgIdStr = String(pkg.package_id);
      const pkgPrice = Number(pkg.price) || 0;
      setWizardLeadData((prev) => ({
        ...prev,
        selected_package_id: pkgIdStr,
        Select_Package_Option: pkgIdStr,
        package_name: pkg.package_name,
        package_cost: pkgPrice,
        package_price: pkgPrice,
        deliverables: pkg.deliverables || '',
        notes: pkg.seasonal_offer ? `Seasonal Offer: ${pkg.seasonal_offer}` : prev.notes,
        budget: pkgPrice,
        final_quoted_amount: pkgPrice,
      }));
      setPkgPrices(prev => ({ ...prev, [pkgIdStr]: pkgPrice, [targetPkgId]: pkgPrice }));
      
      const incList = parseTeamMembers(pkg.team_members);
      const defaultInc = incList.length > 0 ? incList : [];
      
      const delList = parseTeamMembers(pkg.deliverables);
      const defaultDel = delList.length > 0 ? delList : [];

      const newInclusions = { ...editableInclusions };
      newInclusions[pkgIdStr] = [...defaultInc];
      newInclusions[targetPkgId] = [...defaultInc];
      
      const newDeliverables = { ...editableDeliverables };
      newDeliverables[pkgIdStr] = [...defaultDel];
      newDeliverables[targetPkgId] = [...defaultDel];

      if (activeEvents && activeEvents.length > 0) {
        activeEvents.forEach((ev, idx) => {
          const evId = String(ev.id || ev.event_id || `EV-${idx + 1}`);
          newInclusions[`${pkgIdStr}_${evId}`] = [...defaultInc];
          newInclusions[`${targetPkgId}_${evId}`] = [...defaultInc];
          newInclusions[`Custom Package_${evId}`] = [...defaultInc];
          newInclusions[`custom_package_${evId}`] = [...defaultInc];
          newInclusions[evId] = [...defaultInc];
          
          newDeliverables[`${pkgIdStr}_${evId}`] = [...defaultDel];
          newDeliverables[`${targetPkgId}_${evId}`] = [...defaultDel];
          newDeliverables[`Custom Package_${evId}`] = [...defaultDel];
          newDeliverables[`custom_package_${evId}`] = [...defaultDel];
          newDeliverables[evId] = [...defaultDel];
        });
      }

      setEditableInclusions(newInclusions);
      setEditableDeliverables(newDeliverables);
      if (selectedLead && selectedLead.lead_id && selectedLead.lead_id !== 'DRAFT-LEAD') {
        saveStep3DataRealtime(newInclusions, newDeliverables, pkgIdStr, pkgPrice);
      }
    } else {
      setWizardLeadData((prev) => ({
        ...prev,
        selected_package_id: targetPkgId,
        Select_Package_Option: targetPkgId,
      }));
      if (selectedLead && selectedLead.lead_id && selectedLead.lead_id !== 'DRAFT-LEAD') {
        saveStep3DataRealtime(editableInclusions, editableDeliverables, targetPkgId);
      }
    }
  };

  const validateStep3Data = (mode: 'package' | 'all'): boolean => {
    // Validate package selection
    const pkgId = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id;
    if (!pkgId || pkgId.trim() === '') {
      showValidationError("select_package_option", "Please select a package before continuing.");
      showToastMsg("❌ Please complete all required fields before saving the package.", "error");
      return false;
    }

    // Auto-detect & attach current logged-in Sales Executive
    const effName = getEffectiveSalesStaffName();
    const effMobile = getEffectiveSalesStaffMobile();
    if (!salesStaffName || !salesStaffName.trim()) {
      setSalesStaffName(effName);
    }
    if (!salesStaffMobile || !salesStaffMobile.trim()) {
      setSalesStaffMobile(effMobile);
    }

    if (mode === 'all') {
      if (wizardLeadData.status === 'Order Confirmed') {
        if (!wizardLeadData.confirmed_event_date) {
          showValidationError("input_confirmed_event_date", "Please provide Confirmed Event Date.");
          showToastMsg("❌ Please complete all required fields before saving.", "error");
          return false;
        }

        if (wizardLeadData.final_amount === undefined || wizardLeadData.final_amount === null || isNaN(wizardLeadData.final_amount) || wizardLeadData.final_amount <= 0) {
          showValidationError("input_final_amount", "Please provide Final Amount.");
          showToastMsg("❌ Please complete all required fields before saving.", "error");
          return false;
        }
        if (wizardLeadData.advance_received === undefined || wizardLeadData.advance_received === null || isNaN(wizardLeadData.advance_received)) {
          showValidationError("input_advance_received", "Please provide Advance Payment Received.");
          showToastMsg("❌ Please complete all required fields before saving.", "error");
          return false;
        }

        if (crmEvents && crmEvents.length > 0) {
          for (const ev of crmEvents) {
            const rDate = ev.reporting_date || ev.event_date || wizardLeadData.confirmed_event_date;
            if (!rDate) {
              showValidationError(`reporting_date_${ev.id}`, "Reporting Date is required.");
              showToastMsg("❌ Please complete all required fields before saving.", "error");
              return false;
            }
            if (!ev.reporting_time) {
              showValidationError(`reporting_time_${ev.id}`, "Reporting Time is required.");
              showToastMsg("❌ Please complete all required fields before saving.", "error");
              return false;
            }
          }
        }
      }
    }

    return true;
  };

  const completeApprovedUnlockRequest = async (leadId: string) => {
    if (!leadId) return;
    console.log("[DEBUG completeApprovedUnlockRequest] Executing completeApprovedUnlockRequest for leadId:", leadId);
    try {
      const linkedOrder = (orders || []).find(o => o.lead_id === leadId);
      const orderId = linkedOrder?.order_id || (selectedLead as any)?.order_id;
      const nowIso = new Date().toISOString();

      // 1. Update lead record in Supabase & context state: set quotation_locked = true
      try {
        await updateLead(leadId, { quotation_locked: true, updated_at: nowIso } as any);
        console.log("[DEBUG completeApprovedUnlockRequest] Successfully updated lead quotation_locked = true via updateLead for", leadId);
      } catch (lErr: any) {
        console.warn("[DEBUG completeApprovedUnlockRequest] updateLead warning:", lErr?.message || lErr);
      }

      if (selectedLead && selectedLead.lead_id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, quotation_locked: true } : prev);
      }

      // 2. Update unlock_requests table status to Completed
      if (supabaseClient) {
        try {
          const { data: allReqs } = await supabaseClient
            .from('unlock_requests')
            .select('*');

          if (allReqs && allReqs.length > 0) {
            const matchingReqs = allReqs.filter((r: any) => {
              const matchesLead = r.lead_id === leadId || r.order_id === leadId || r.project_id === leadId;
              const matchesOrder = orderId && (r.order_id === orderId || r.lead_id === orderId);
              return matchesLead || matchesOrder;
            });

            for (const req of matchingReqs) {
              const reqKeyCol = req.id ? 'id' : (req.request_id ? 'request_id' : 'lead_id');
              const reqKeyVal = req.id || req.request_id || req.lead_id;

              await supabaseClient
                .from('unlock_requests')
                .update({
                  request_status: 'Completed',
                  status: 'Completed',
                  completed_at: nowIso,
                  edited_at: nowIso,
                  updated_at: nowIso
                })
                .eq(reqKeyCol, reqKeyVal);
            }
          }

          // Proxy call fallback
          await fetch('/api/db/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'unlock_requests',
              matchColumn: 'lead_id',
              matchValue: leadId,
              updates: { request_status: 'Completed', status: 'Completed', completed_at: nowIso, updated_at: nowIso }
            })
          }).catch(() => {});

          if (orderId && orderId !== leadId) {
            await fetch('/api/db/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'unlock_requests',
                matchColumn: 'order_id',
                matchValue: orderId,
                updates: { request_status: 'Completed', status: 'Completed', completed_at: nowIso, updated_at: nowIso }
              })
            }).catch(() => {});
          }
        } catch (dbErr: any) {
          console.warn("[DEBUG completeApprovedUnlockRequest] unlock_requests DB update warning:", dbErr?.message || dbErr);
        }
      }

      // 3. Update local React unlockRequests state
      setUnlockRequests(prev => Array.isArray(prev) ? prev.map(r => {
        const matchesLead = r.lead_id === leadId || r.order_id === leadId || r.project_id === leadId;
        const matchesOrder = orderId && (r.order_id === orderId || r.lead_id === orderId);
        if (matchesLead || matchesOrder) {
          return {
            ...r,
            request_status: 'Completed',
            status: 'Completed',
            completed_at: nowIso,
            edited_at: nowIso
          };
        }
        return r;
      }) : []);

      // Re-fetch unlock_requests from DB to stay synchronized
      if (supabaseClient) {
        const { data } = await supabaseClient.from('unlock_requests').select('*');
        if (data) {
          setUnlockRequests(data.map((r: any) => ({
            ...r,
            request_status: r.request_status || r.status || 'Pending',
            status: r.request_status || r.status || 'Pending',
            reason: r.request_reason || r.reason || '',
            sales_staff_name: r.requested_by_name || r.sales_staff_name || '',
            sales_staff_id: r.requested_by_user_id || r.sales_staff_id || ''
          })));
        }
      }

    } catch (err: any) {
      console.error("[DEBUG completeApprovedUnlockRequest] Exception during unlock completion:", err?.message || err);
    }
  };

  const handleSavePackageOnly = async () => {
    if (isSaving) return;
    if (isCrmLocked) {
      showToastMsg(
        isMultiEventLead
          ? "All events have ended. This CRM is now locked."
          : "Event has ended. This CRM is now locked.",
        "error"
      );
      return;
    }
    if (isStep3Locked) {
      showToastMsg("Quotation details are locked. Owner unlock approval required to edit.", "error");
      return;
    }
    const targetLeadId = selectedLead?.lead_id || createdLeadId;
    setIsSaving(true);
    try {
      // 1. Perform unified validation
      if (!validateStep3Data('package')) {
        setIsSaving(false);
        return;
      }

      const pkgId = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option || 'Custom Package';
      const currentEvents = selectedLead ? crmEvents : createEvents;

      const { teamMembersJson, deliverablesJson, flatTeamMembers, teamMembersText, deliverablesText } = buildStep3EventPayloads(
        pkgId,
        currentEvents,
        editableInclusions,
        editableDeliverables
      );

      // 3. Update the lead record in Supabase with latest Step 3 package / pricing / staff info
      const updatedRemarks = appendCompletedStep(wizardLeadData.notes || '', 3);
      
      const updatedEvents = currentEvents.map(ev => ({
        ...ev,
        assigned_staff_names: ev.assigned_staff_names || '',
        assigned_staff_mobiles: ev.assigned_staff_mobiles || ''
      }));

      const cleanPkgCost = wizardLeadData.package_cost !== "" && wizardLeadData.package_cost != null && !isNaN(Number(wizardLeadData.package_cost))
        ? Number(wizardLeadData.package_cost)
        : (wizardLeadData.package_price !== "" && wizardLeadData.package_price != null && !isNaN(Number(wizardLeadData.package_price))
          ? Number(wizardLeadData.package_price)
          : (wizardLeadData.budget ? Number(wizardLeadData.budget) : (selectedLead?.package_price || selectedLead?.budget || undefined)));

      const cleanDiscount = quoteDiscount === "" || quoteDiscount == null || isNaN(Number(quoteDiscount)) ? null : Number(quoteDiscount);
      const cleanAdditional = quoteAdditional === "" || quoteAdditional == null || isNaN(Number(quoteAdditional)) ? null : Number(quoteAdditional);
      const cleanFinalAmt = Math.max(0, (cleanPkgCost || 0) + (cleanAdditional || 0) - (cleanDiscount || 0));

      const effectiveSalesName = getEffectiveSalesStaffName();
      const effectiveSalesMobile = getEffectiveSalesStaffMobile();

      const safeTeamMembersText = teamMembersText;
      const safeDeliverablesText = deliverablesText;

      if (targetLeadId && targetLeadId !== 'DRAFT-LEAD' && supabaseClient) {
        console.log('TEAM MEMBERS SAVE in handleSavePackageOnly', { leadId: targetLeadId, teamMembers: flatTeamMembers, serialized: safeTeamMembersText });
        
        try {
          const { data: dbResult, error: dbError } = await supabaseClient
            .from('leads')
            .update({
              budget: cleanPkgCost,
              package_price: cleanPkgCost,
              deliverables_description: safeDeliverablesText,
              Team_member: safeTeamMembersText,
              Team_Members: safeTeamMembersText,
              Add_Deliverable: safeDeliverablesText,
              Add_Member: safeTeamMembersText,
              notes_special_customizations: wizardLeadData.notes,
              remarks: updatedRemarks,
              Select_Package_Option: pkgId,
              sales_staff_name: effectiveSalesName,
              sales_staff_mobile: effectiveSalesMobile,
              Quotation_Discount: cleanDiscount,
              Additional_Services_Cost: cleanAdditional,
              Final_Quotation_Amount: cleanFinalAmt,
              Final_Package_Amount: cleanFinalAmt,
              events: updatedEvents
            })
            .eq('lead_id', targetLeadId)
            .select('*');

          if (dbError) {
            console.warn("Direct Supabase leads update warning in handleSavePackageOnly:", dbError);
          }
        } catch (leadUpdateErr) {
          console.warn("Direct Supabase update exception in handleSavePackageOnly:", leadUpdateErr);
        }

        await updateLead(targetLeadId, {
          budget: cleanPkgCost,
          package_price: cleanPkgCost,
          deliverables_description: safeDeliverablesText,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          Add_Deliverable: safeDeliverablesText,
          Add_Member: safeTeamMembersText,
          notes_special_customizations: wizardLeadData.notes,
          remarks: updatedRemarks,
          Select_Package_Option: pkgId,
          sales_staff_name: effectiveSalesName,
          sales_staff_mobile: effectiveSalesMobile,
          Quotation_Discount: cleanDiscount,
          Additional_Services_Cost: cleanAdditional,
          Final_Quotation_Amount: cleanFinalAmt,
          Final_Package_Amount: cleanFinalAmt,
          final_package_amount: cleanFinalAmt,
          _explicit_step3_save: true,
          events: updatedEvents
        });

        // Also upsert to lead_packages table so that Step 3 reloads from lead_packages perfectly
        try {
          const rawPackagePayload = {
            lead_id: targetLeadId,
            package_id: pkgId,
            package_name: wizardLeadData.package_name || (pkgId === 'Custom Package' || pkgId === 'custom_package' ? 'Custom Package' : `Package ${pkgId}`),
            package_cost: cleanPkgCost || 0,
            quantity: 1,
            total_amount: cleanPkgCost || 0,
            discount: cleanDiscount || 0,
            final_amount: cleanFinalAmt || 0,
            Team_Members_Included: teamMembersJson,
            editable_inclusions: editableInclusions,
            deliverables_descriptionn: deliverablesJson,
            deliverables_description: deliverablesText,
            editable_deliverables: editableDeliverables,
            updated_at: new Date().toISOString()
          };

          // Verify if 'Team_Members_Included' and 'deliverables_descriptionn' data are correctly structured before the API call
          const { payload: packagePayload, isValid, teamMembersValid, deliverablesValid, issues } = verifyAndFormatLeadPackagePayload(
            rawPackagePayload,
            'handleSavePackageOnly [Save Package]'
          );

          console.log('[lead_packages API Preparation] Target Lead ID:', targetLeadId, 'Package ID:', pkgId);
          console.log('[lead_packages API Preparation] Verification status:', {
            isValid,
            teamMembersValid,
            deliverablesValid,
            issuesCount: issues.length,
            Team_Members_Included_Type: Array.isArray(packagePayload.Team_Members_Included) ? 'Array' : typeof packagePayload.Team_Members_Included,
            deliverables_descriptionn_Type: Array.isArray(packagePayload.deliverables_descriptionn) ? 'Array' : typeof packagePayload.deliverables_descriptionn
          });

          const { data: existingLps, error: fetchLpErr } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', targetLeadId);

          if (fetchLpErr) {
            console.warn("[lead_packages] Error querying existing lead_packages:", fetchLpErr);
          }

          let targetLpId = `LP-${targetLeadId}-${pkgId}`;
          if (existingLps && existingLps.length > 0) {
            const matched = existingLps.find(lp => String(lp.package_id) === String(pkgId)) || existingLps[0];
            targetLpId = matched.lead_package_id || matched.id || targetLpId;
            console.log(`🚀 [Supabase API Call] Updating 'lead_packages' record (lead_package_id: "${targetLpId}"):`, packagePayload);
            const { data: updateRes, error: updateErr } = await supabaseClient
              .from('lead_packages')
              .update(packagePayload)
              .eq(matched.lead_package_id ? 'lead_package_id' : 'id', targetLpId)
              .select('*');

            if (updateErr) {
              console.error(`❌ [Supabase API Error] Error updating 'lead_packages':`, updateErr);
            } else {
              console.log(`✅ [Supabase API Success] Successfully updated 'lead_packages' record:`, updateRes);
            }
          } else {
            console.log(`🚀 [Supabase API Call] Inserting new 'lead_packages' record (lead_package_id: "${targetLpId}"):`, packagePayload);
            const { data: insertRes, error: insertErr } = await supabaseClient
              .from('lead_packages')
              .insert({
                ...packagePayload,
                lead_package_id: targetLpId,
                created_at: new Date().toISOString()
              })
              .select('*');

            if (insertErr) {
              console.error(`❌ [Supabase API Error] Error inserting into 'lead_packages':`, insertErr);
            } else {
              console.log(`✅ [Supabase API Success] Successfully inserted 'lead_packages' record:`, insertRes);
            }
          }
        } catch (lpErr) {
          console.error("❌ Exception while upserting lead_packages record in handleSavePackageOnly:", lpErr);
        }
      }

      // Persist step 3 completion so reopening opens at step 3
      const newCompleted = Math.max(crmHighestStep, 3);
      setCrmHighestStep(newCompleted);
      if (targetLeadId && targetLeadId !== 'DRAFT-LEAD') {
        localStorage.setItem(`crm_last_step_${targetLeadId}`, String(newCompleted));
      }

      // Invalidate the cache ref so subsequent fetches will pull the fresh saved data
      lastLoadedLeadIdRef.current = null;

      setWizardLeadData(prev => ({
        ...prev,
        deliverables: safeDeliverablesText,
        deliverables_description: safeDeliverablesText,
        Team_member: safeTeamMembersText,
        Team_Members: safeTeamMembersText,
        team_members: safeTeamMembersText,
        Add_Deliverable: safeDeliverablesText,
        Add_Member: safeTeamMembersText,
        package_cost: cleanPkgCost ?? prev.package_cost,
        package_price: cleanPkgCost ?? prev.package_price,
        budget: cleanPkgCost ?? prev.budget,
        selected_package_id: pkgId,
        Select_Package_Option: pkgId,
        final_amount: cleanFinalAmt
      }));

      // Update the local selectedLead state so that the UI reflects it
      if (selectedLead) {
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            budget: cleanPkgCost || 0,
            package_price: cleanPkgCost || 0,
            deliverables_description: safeDeliverablesText,
            Team_Members: safeTeamMembersText,
            Team_member: safeTeamMembersText,
            team_members: safeTeamMembersText,
            Add_Deliverable: safeDeliverablesText,
            Add_Member: safeTeamMembersText,
            notes_special_customizations: wizardLeadData.notes,
            remarks: updatedRemarks,
            Select_Package_Option: pkgId,
            selected_package_id: pkgId,
            sales_staff_name: effectiveSalesName,
            sales_staff_mobile: effectiveSalesMobile,
            Quotation_Discount: cleanDiscount,
            Additional_Services_Cost: cleanAdditional,
            Final_Quotation_Amount: cleanFinalAmt,
            Final_Package_Amount: cleanFinalAmt,
            final_package_amount: cleanFinalAmt,
            events: updatedEvents
          };
        });
        await completeApprovedUnlockRequest(selectedLead.lead_id);
      }

      showToastMsg("Package configuration saved successfully!", "success");
    } catch (err: any) {
      console.error("Save package only failed:", err);
      setSaveErrorPopup({
        title: "Failed to save package",
        message: `❌ Failed to save package: ${err?.message || 'Unknown error'}.\nPlease try again.`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep = async (step: number) => {
    if (!selectedLead) return;
    if (isCrmLocked) {
      showToastMsg(
        isMultiEventLead
          ? "All events have ended. This CRM is now locked."
          : "Event has ended. This CRM is now locked.",
        "error"
      );
      return;
    }
    setIsSaving(true);
    try {
      if (step === 1) {
        if (isStep1Locked) {
          showToastMsg("Customer details are locked after order confirmation.", "error");
          setIsSaving(false);
          return;
        }
        if (!wizardLeadData.mobile) {
          showToastMsg("Phone Number is required.", "error");
          setIsSaving(false);
          return;
        }
        const mobileVal = String(wizardLeadData.mobile || '').trim();
        if (!/^\d{10}$/.test(mobileVal)) {
          showToastMsg("Please enter a valid 10-digit mobile number.", "error");
          setIsSaving(false);
          return;
        }
        if (!wizardLeadData.lead_source) {
          showToastMsg("Lead Source is required.", "error");
          setIsSaving(false);
          return;
        }
        const updatedRemarks = appendCompletedStep(selectedLead.remarks || wizardLeadData.remarks, 1);
        await updateLead(selectedLead.lead_id, {
          customer_name: wizardLeadData.customer_name || '',
          mobile: wizardLeadData.mobile,
          whatsapp_number: wizardLeadData.whatsapp_number,
          email: wizardLeadData.email,
          address: wizardLeadData.address,
          city: wizardLeadData.city,
          state: wizardLeadData.state,
          pincode: wizardLeadData.pincode,
          client_residence_address: wizardLeadData.client_residence_address,
          lead_source: wizardLeadData.lead_source,
          Specify_Custom_Lead_Source_Name: wizardLeadData.lead_source === 'Other' && wizardLeadData.Specify_Custom_Lead_Source_Name?.trim() !== '' ? wizardLeadData.Specify_Custom_Lead_Source_Name.trim() : null,
          total_pax: wizardLeadData.total_pax,
          reference_source: wizardLeadData.reference_source,
          Select_Package_Option: wizardLeadData.selected_package_id || wizardLeadData.Select_Package_Option || selectedLead.Select_Package_Option || '',
          remarks: updatedRemarks,
          status: getStatusRank(selectedLead.status || selectedLead.current_status) < 1 || selectedLead.status === 'New Lead' ? 'Create Quote' : (selectedLead.status || 'Create Quote'),
          current_status: getStatusRank(selectedLead.status || selectedLead.current_status) < 1 || selectedLead.status === 'New Lead' ? 'Create Quote' : (selectedLead.current_status || selectedLead.status || 'Create Quote')
        });

        const newCompleted = Math.max(crmHighestStep, 1);
        setCrmHighestStep(newCompleted);
        localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));

        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            remarks: updatedRemarks
          };
        });

        showToastMsg("CRM Updated Successfully.", "success");
      } else if (step === 2) {
        if (isStep2Locked) {
          showToastMsg("Event details are locked after order confirmation.", "error");
          setIsSaving(false);
          return;
        }
        let finalEventsList = [...crmEvents];

        if (showEventForm || finalEventsList.length === 0) {
          if (!eventForm.event_type || eventForm.event_type === '') {
            showToastMsg("Please select Event Type.", "error");
            setIsSaving(false);
            return;
          }
          if (!eventForm.event_date || eventForm.event_date === '') {
            showToastMsg("Please select Event Date.", "error");
            setIsSaving(false);
            return;
          }
          if (!eventForm.event_location || eventForm.event_location.trim() === '') {
            showToastMsg("Please enter Event Location.", "error");
            setIsSaving(false);
            return;
          }

          const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
          if (dateTimeErrMsg) {
            showToastMsg(dateTimeErrMsg, "error");
            setIsSaving(false);
            return;
          }

          const guestPaxVal = eventForm.guest_pax !== '' ? Math.max(0, parseInt(String(eventForm.guest_pax)) || 0) : '';
          const staffPaxVal = eventForm.staff_pax !== '' ? Math.max(0, parseInt(String(eventForm.staff_pax)) || 0) : '';

          const eventData = {
            ...eventForm,
            guest_pax: guestPaxVal,
            staff_pax: staffPaxVal,
            event_start_date: eventForm.event_date,
            event_end_date: eventForm.event_end_date || ''
          };

          if (editingEventId) {
            finalEventsList = finalEventsList.map(ev => ev.id === editingEventId ? { ...eventData, id: editingEventId } : ev);
          } else {
            finalEventsList.push({
              ...eventData,
              id: `EV-${Math.floor(1000 + Math.random() * 9000)}`
            });
          }

          setCrmEvents(finalEventsList);
          setEditingEventId(null);
          setShowEventForm(false);
        }

        if (finalEventsList.length === 0) {
          showToastMsg("Please add at least one event.", "error");
          setIsSaving(false);
          return;
        }

        // Pre-validate and format all events in the finalEventsList
        for (const ev of finalEventsList) {
          if (!ev.event_type || ev.event_type.trim() === '') {
            showToastMsg("Please select Event Type for all events.", "error");
            setIsSaving(false); return;
          }
          if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
            showToastMsg("Please enter Event Name for 'Other' event types.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_date || ev.event_date.trim() === '') {
            showToastMsg("Please select Event Date for all events.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_start_time || ev.event_start_time.trim() === '') {
            showToastMsg("Please select Event Start Time for all events.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_end_time || ev.event_end_time.trim() === '') {
            showToastMsg("Please select Event End Time for all events.", "error");
            setIsSaving(false); return;
          }
          if (!ev.event_location || ev.event_location.trim() === '') {
            showToastMsg("Please enter Event Location for all events.", "error");
            setIsSaving(false); return;
          }
          
          try {
            ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
          } catch (err: any) {
            showToastMsg(err.message, "error");
            setIsSaving(false);
            return;
          }
          try {
            ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
          } catch (err: any) {
            showToastMsg(err.message, "error");
            setIsSaving(false);
            return;
          }
          
          const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
          if (dateTimeErrMsg) {
            showToastMsg(dateTimeErrMsg, "error");
            setIsSaving(false);
            return;
          }
        }


        // Perform direct save for Step 2 without showing follow-up popup
        await handleSaveStep2Direct();
        return;
      } else if (step === 3) {
        if (isStep3Locked) {
          showToastMsg("Quotation details are locked. Owner unlock approval required to edit.", "error");
          setIsSaving(false);
          return;
        }
        if (!validateStep3Data('all')) {
          setIsSaving(false);
          return;
        }
        const pkgId = wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedLead.Select_Package_Option || 'Custom Package';
        const { teamMembersJson, deliverablesJson, flatTeamMembers, teamMembersText, deliverablesText } = buildStep3EventPayloads(
          pkgId,
          crmEvents,
          editableInclusions,
          editableDeliverables
        );

        const updatedRemarks = appendCompletedStep(wizardLeadData.notes || '', 3);
        
        const updatedEvents = crmEvents.map(ev => ({
          ...ev,
          assigned_staff_names: ev.assigned_staff_names || '',
          assigned_staff_mobiles: ev.assigned_staff_mobiles || ''
        }));

        const cleanPkgCost = wizardLeadData.package_cost !== "" && wizardLeadData.package_cost != null && !isNaN(Number(wizardLeadData.package_cost)) ? Number(wizardLeadData.package_cost) : (wizardLeadData.package_price !== "" && wizardLeadData.package_price != null && !isNaN(Number(wizardLeadData.package_price)) ? Number(wizardLeadData.package_price) : null);
        const cleanDiscount = quoteDiscount === "" || quoteDiscount == null || isNaN(Number(quoteDiscount)) ? null : Number(quoteDiscount);
        const cleanAdditional = quoteAdditional === "" || quoteAdditional == null || isNaN(Number(quoteAdditional)) ? null : Number(quoteAdditional);
        const cleanFinalAmt = Math.max(0, (cleanPkgCost || 0) + (cleanAdditional || 0) - (cleanDiscount || 0));
        const cleanPincode = wizardLeadData.pincode === "" || wizardLeadData.pincode == null ? null : wizardLeadData.pincode;

        const effectiveSalesName = getEffectiveSalesStaffName();
        const effectiveSalesMobile = getEffectiveSalesStaffMobile();

        const safeTeamMembersText = teamMembersText;
        const safeDeliverablesText = deliverablesText;

        console.log('TEAM MEMBERS SAVE in handleStep3Submit', { leadId: selectedLead.lead_id, teamMembers: flatTeamMembers, serialized: safeTeamMembersText });

        try {
          const { data: dbResult, error: dbError } = await supabaseClient
            .from('leads')
            .update({
              budget: cleanPkgCost,
              package_price: cleanPkgCost,
              deliverables_description: safeDeliverablesText,
              Team_member: safeTeamMembersText,
              Team_Members: safeTeamMembersText,
              Add_Deliverable: safeDeliverablesText,
              Add_Member: safeTeamMembersText,
              notes_special_customizations: wizardLeadData.notes,
              remarks: updatedRemarks,
              Select_Package_Option: pkgId,
              client_residence_address: wizardLeadData.client_residence_address,
              city: wizardLeadData.city,
              state: wizardLeadData.state,
              pincode: cleanPincode,
              sales_staff_name: effectiveSalesName,
              sales_staff_mobile: effectiveSalesMobile,
              Quotation_Discount: cleanDiscount,
              Additional_Services_Cost: cleanAdditional,
              Final_Quotation_Amount: cleanFinalAmt,
              Final_Package_Amount: cleanFinalAmt,
              events: updatedEvents
            })
            .eq('lead_id', selectedLead.lead_id)
            .select('*');

          if (dbError) {
            console.warn("Direct Supabase leads update warning in handleStep3Submit:", dbError);
          }
        } catch (leadUpdateErr) {
          console.warn("Direct Supabase update exception in handleStep3Submit:", leadUpdateErr);
        }

        await updateLead(selectedLead.lead_id, {
          budget: cleanPkgCost,
          package_price: cleanPkgCost,
          deliverables_description: safeDeliverablesText,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          Add_Deliverable: safeDeliverablesText,
          Add_Member: safeTeamMembersText,
          notes_special_customizations: wizardLeadData.notes,
          remarks: updatedRemarks,
          Select_Package_Option: pkgId,
          client_residence_address: wizardLeadData.client_residence_address,
          city: wizardLeadData.city,
          state: wizardLeadData.state,
          pincode: cleanPincode,
          sales_staff_name: effectiveSalesName,
          sales_staff_mobile: effectiveSalesMobile,
          Quotation_Discount: cleanDiscount,
          Additional_Services_Cost: cleanAdditional,
          Final_Quotation_Amount: cleanFinalAmt,
          Final_Package_Amount: cleanFinalAmt,
          final_package_amount: cleanFinalAmt,
          _explicit_step3_save: true,
          events: updatedEvents
        });

        // Also upsert to lead_packages table
        try {
          const rawPackagePayloadStep3 = {
            lead_id: selectedLead.lead_id,
            package_id: pkgId,
            package_name: wizardLeadData.package_name || (pkgId === 'Custom Package' || pkgId === 'custom_package' ? 'Custom Package' : `Package ${pkgId}`),
            package_cost: cleanPkgCost || 0,
            quantity: 1,
            total_amount: cleanPkgCost || 0,
            discount: cleanDiscount || 0,
            final_amount: cleanFinalAmt || 0,
            Team_Members_Included: teamMembersJson,
            editable_inclusions: editableInclusions,
            deliverables_descriptionn: deliverablesJson,
            deliverables_description: deliverablesText,
            editable_deliverables: editableDeliverables,
            updated_at: new Date().toISOString()
          };

          const { payload: packagePayloadStep3, isValid, teamMembersValid, deliverablesValid, issues } = verifyAndFormatLeadPackagePayload(
            rawPackagePayloadStep3,
            'handleStep3Submit [Step 3 Save & Continue]'
          );

          const { data: existingLpsS3, error: fetchErrS3 } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', selectedLead.lead_id);

          if (fetchErrS3) {
            console.warn("[lead_packages Step3] Error querying existing lead_packages:", fetchErrS3);
          }

          let targetLpIdS3 = `LP-${selectedLead.lead_id}-${pkgId}`;
          if (existingLpsS3 && existingLpsS3.length > 0) {
            const matched = existingLpsS3.find(lp => String(lp.package_id) === String(pkgId)) || existingLpsS3[0];
            targetLpIdS3 = matched.lead_package_id || matched.id || targetLpIdS3;
            console.log(`🚀 [Supabase API Call] Step 3 updating 'lead_packages' (ID: "${targetLpIdS3}"):`, packagePayloadStep3);
            const { data: updateRes, error: updateErr } = await supabaseClient
              .from('lead_packages')
              .update(packagePayloadStep3)
              .eq(matched.lead_package_id ? 'lead_package_id' : 'id', targetLpIdS3)
              .select('*');

            if (updateErr) {
              console.error(`❌ [Supabase API Error] Step 3 error updating 'lead_packages':`, updateErr);
            } else {
              console.log(`✅ [Supabase API Success] Step 3 updated 'lead_packages' record:`, updateRes);
            }
          } else {
            console.log(`🚀 [Supabase API Call] Step 3 inserting 'lead_packages' (ID: "${targetLpIdS3}"):`, packagePayloadStep3);
            const { data: insertRes, error: insertErr } = await supabaseClient
              .from('lead_packages')
              .insert({
                ...packagePayloadStep3,
                lead_package_id: targetLpIdS3,
                created_at: new Date().toISOString()
              })
              .select('*');

            if (insertErr) {
              console.error(`❌ [Supabase API Error] Step 3 error inserting 'lead_packages':`, insertErr);
            } else {
              console.log(`✅ [Supabase API Success] Step 3 inserted 'lead_packages' record:`, insertRes);
            }
          }
        } catch (lpErr) {
          console.warn("Could not upsert lead_packages record in handleStep3Submit:", lpErr);
        }

        setWizardLeadData(prev => ({
          ...prev,
          deliverables: safeDeliverablesText,
          deliverables_description: safeDeliverablesText,
          Team_member: safeTeamMembersText,
          Team_Members: safeTeamMembersText,
          team_members: safeTeamMembersText,
          package_price: cleanPkgCost ?? prev.package_price,
          selected_package_id: pkgId,
          Select_Package_Option: pkgId,
          final_amount: cleanFinalAmt
        }));

        const newCompleted = Math.max(crmHighestStep, 3);
        setCrmHighestStep(newCompleted);
        localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));

        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            budget: cleanPkgCost ?? prev.budget,
            package_price: cleanPkgCost ?? prev.package_price,
            deliverables_description: safeDeliverablesText,
            Team_member: safeTeamMembersText,
            Team_Members: safeTeamMembersText,
            team_members: safeTeamMembersText,
            notes_special_customizations: wizardLeadData.notes,
            remarks: updatedRemarks,
            selected_package_id: pkgId,
            Select_Package_Option: pkgId,
            client_residence_address: wizardLeadData.client_residence_address,
            city: wizardLeadData.city,
            state: wizardLeadData.state,
            pincode: wizardLeadData.pincode,
            sales_staff_name: effectiveSalesName,
            sales_staff_mobile: effectiveSalesMobile,
            Quotation_Discount: cleanDiscount,
            Additional_Services_Cost: cleanAdditional,
            Final_Quotation_Amount: cleanFinalAmt,
            Final_Package_Amount: cleanFinalAmt,
            final_package_amount: cleanFinalAmt
          };
        });

        if (isLeadConfirmed) {
          try {
            const linkedOrder = orders?.find(o => o.lead_id === selectedLead.lead_id);
            if (linkedOrder && supabaseClient) {
              const adv = Number(linkedOrder.advance_received || 0);
              const newBalance = Math.max(0, cleanFinalAmt - adv);
              await supabaseClient
                .from('orders')
                .update({
                  package_name: packages.find(p => p.package_id === pkgId)?.package_name || pkgId,
                  quotation_amount: cleanFinalAmt,
                  final_amount: cleanFinalAmt,
                  package_price: cleanPkgCost,
                  quotation_discount: cleanDiscount,
                  additional_services_cost: cleanAdditional,
                  balance_amount: newBalance,
                  deliverables_description: safeDeliverablesText,
                  team_members: safeTeamMembersText,
                  notes: wizardLeadData.notes || (linkedOrder as any)?.notes || '',
                  updated_at: new Date().toISOString()
                })
                .eq('order_id', linkedOrder.order_id);

              // Update payments table without modifying historical payment transactions
              const { data: linkedPayments } = await supabaseClient
                .from('payments')
                .select('*')
                .eq('order_id', linkedOrder.order_id);

              if (linkedPayments && linkedPayments.length > 0) {
                for (const pay of linkedPayments) {
                  const actualPaid = (Number(pay.advance_received) || 0) + (Number(pay.final_payment_received) || 0) + (Number(pay.additional_received) || 0);
                  const newBalanceDue = Math.max(0, cleanFinalAmt - actualPaid);
                  const newStatus = (pay.payment_status === 'Waiting for Approval')
                    ? 'Waiting for Approval'
                    : (newBalanceDue <= 0 && cleanFinalAmt > 0) 
                      ? 'Fully Paid' 
                      : (actualPaid > 0 ? 'Partially Paid' : (pay.payment_status || 'Pending'));

                  await supabaseClient
                    .from('payments')
                    .update({
                      quotation_amount: cleanFinalAmt,
                      balance_due: newBalanceDue,
                      payment_status: newStatus,
                      updated_at: new Date().toISOString()
                    })
                    .eq('payment_id', pay.payment_id);
                }
              }
            }

            // Invalidate stale cached quote services in localStorage
            try {
              localStorage.removeItem(`erp_quote_services_${selectedLead.lead_id}`);
            } catch (e) {}

            // Re-fetch and verify from Supabase
            if (supabaseClient) {
              const { data: verifiedLead } = await supabaseClient
                .from('leads')
                .select('*')
                .eq('lead_id', selectedLead.lead_id)
                .single();

              if (verifiedLead) {
                const verifiedPkgPrice = Number(verifiedLead.package_price ?? cleanPkgCost);
                const verifiedDiscount = Number(verifiedLead.Quotation_Discount ?? cleanDiscount);
                const verifiedAdditional = Number(verifiedLead.Additional_Services_Cost ?? cleanAdditional);
                const verifiedFinalAmt = Math.max(0, verifiedPkgPrice - verifiedDiscount + verifiedAdditional);

                setSelectedLead(prev => prev ? {
                  ...prev,
                  ...verifiedLead,
                  package_price: verifiedPkgPrice,
                  budget: verifiedPkgPrice,
                  Quotation_Discount: verifiedDiscount,
                  Additional_Services_Cost: verifiedAdditional,
                  Final_Quotation_Amount: verifiedFinalAmt,
                  Final_Package_Amount: verifiedFinalAmt,
                  final_package_amount: verifiedFinalAmt
                } : null);

                setWizardLeadData(prev => ({
                  ...prev,
                  package_cost: verifiedPkgPrice,
                  package_price: verifiedPkgPrice,
                  budget: verifiedPkgPrice,
                  final_amount: verifiedFinalAmt,
                  final_quoted_amount: verifiedFinalAmt
                }));
              }
            }

            if (refreshData) {
              await refreshData();
            }
          } catch (syncErr) {
            console.warn("Order/payment sync warning on Step 3 Save:", syncErr);
          }

          showToastMsg("Record saved successfully.", "success");
          setShowStep3Popup(false);
          setIsSaving(false);
          return;
        }

        await completeApprovedUnlockRequest(selectedLead.lead_id);
        showToastMsg(`✅ Quotation & CRM changes saved.`, "success");
        setStep3FollowUpDate(selectedLead?.next_follow_up_date || '');
        setStep3FollowUpTime((selectedLead as any)?.next_follow_up_time || '');
        setStep3FollowUpNotes(selectedLead?.follow_up_notes || '');
        setShowStep3Popup(true);
        setIsSaving(false);
        return; // Open follow-up popup
      }

      if (step < 3) {
        let nextStep = step + 1;
        setCrmWizardStep(nextStep);
        setTimeout(() => {
          document.getElementById('crm-wizard-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
        }, 50);
      } else {
        setSelectedLead(null);
      }
    } catch (err: any) {
      console.error("Save failed:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);
      
      const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;
      const newStatus = wizardLeadData?.status || undefined;
      
      logStatusUpdateError({
        leadId: selectedLead?.lead_id || undefined,
        orderId: null,
        oldStatus,
        newStatus,
        updatePayload: {
          budget: Number(wizardLeadData?.package_cost || wizardLeadData?.budget || 0),
          package_price: Number(wizardLeadData?.package_cost || 0),
          remarks: wizardLeadData?.remarks || wizardLeadData?.notes || '',
          selected_package_id: wizardLeadData?.selected_package_id || (wizardLeadData as any)?.Select_Package_Option || ''
        },
        insertPayload: null,
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "CRM Multi-step Wizard Status Update Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      showToastMsg(parsed.reason, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Automatic background sync for Quote Sent -> Quote Follow-up when follow-up date and time are reached
  React.useEffect(() => {
    if (!leads || leads.length === 0) return;

    const checkAndSyncFollowUp = () => {
      leads.forEach(async (ld) => {
        const rawSt = ld.current_status || ld.status;
        if ((rawSt === 'Quote Sent' || rawSt === 'Quotation Sent') && isFollowUpDateTimeReached(ld)) {
          try {
            await updateLeadFollowUp(
              ld.lead_id,
              'Quote Follow-up' as CurrentStage,
              'Auto updated: Scheduled follow-up date and time reached',
              ld.next_follow_up_date || '',
              Number(ld.budget || 0),
              ld.follow_up_notes || 'Follow-up date and time reached'
            );
          } catch (e) {
            // Silent auto sync
          }
        }
      });
    };

    checkAndSyncFollowUp();
    const interval = setInterval(checkAndSyncFollowUp, 30000);
    return () => clearInterval(interval);
  }, [leads]);

  const handleSaveStep2Direct = async (passedEvents?: any[]) => {
    const isCreateFlow = activeTab === 'create';
    if (!isCreateFlow && isStep2Locked) {
      showToastMsg("Event details are locked after order confirmation.", "error");
      return;
    }
    const currentLeadId = isCreateFlow ? createdLeadId : selectedLead?.lead_id;
    if (!currentLeadId) {
      showToastMsg("Lead not initialized yet.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const finalEventsList = passedEvents || (isCreateFlow ? [...createEvents] : [...crmEvents]);
      if (finalEventsList.length === 0) {
        showToastMsg("Please add at least one event.", "error");
        setIsSaving(false);
        return;
      }
      
      // Pre-validate and format all events in the finalEventsList
      for (const ev of finalEventsList) {
        if (!ev.event_type || ev.event_type.trim() === '') {
          showToastMsg("Please select Event Type for all events.", "error");
          setIsSaving(false); return;
        }
        if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
          showToastMsg("Please enter Event Name for 'Other' event types.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_date || ev.event_date.trim() === '') {
          showToastMsg("Please select Event Date for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_start_time || ev.event_start_time.trim() === '') {
          showToastMsg("Please select Event Start Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_end_time || ev.event_end_time.trim() === '') {
          showToastMsg("Please select Event End Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_location || ev.event_location.trim() === '') {
          showToastMsg("Please enter Event Location for all events.", "error");
          setIsSaving(false); return;
        }
        
        try {
          ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        try {
          ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        
        const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
        if (dateTimeErrMsg) {
          showToastMsg(dateTimeErrMsg, "error");
          setIsSaving(false); return;
        }
      }

      const firstEvent = finalEventsList[0];

      const formattedEventTime = validateAndFormatTime(firstEvent.event_start_time, "Event Start Time");
      const formattedReportingTime = validateAndFormatTime(isCreateFlow ? reportingTime : wizardLeadData.reporting_time, "Reporting Time");

      await updateLead(currentLeadId, {
        event_type: firstEvent.event_type === 'Other' ? 'Other' : firstEvent.event_type,
        custom_event_name: firstEvent.event_name,
        custom_event_type: firstEvent.event_type === 'Other' ? firstEvent.event_name : undefined,
        event_date: firstEvent.event_date,
        Event_End_Date: firstEvent.event_end_date || (firstEvent as any).Event_End_Date || null,
        event_time: formattedEventTime || null,
        event_start_time: firstEvent.event_start_time || null,
        event_end_time: firstEvent.event_end_time || null,
        reporting_time: formattedReportingTime || null,
        event_location: firstEvent.event_location,
        google_maps_link: firstEvent.google_maps_link || '',
        lead_source: isCreateFlow ? createForm.lead_source : wizardLeadData.lead_source,
        event_shoot_type: firstEvent.event_shoot_type || '',
        client_residence_address: isCreateFlow ? createForm.client_residence_address : wizardLeadData.client_residence_address,
        city: isCreateFlow ? createForm.city : wizardLeadData.city,
        state: isCreateFlow ? createForm.state : wizardLeadData.state,
        pincode: isCreateFlow ? createForm.pincode : wizardLeadData.pincode,
        total_pax: Number(firstEvent.guest_pax) !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : undefined,
        guest_pax: Number(firstEvent.guest_pax) !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : undefined,
        staff_pax: Number(firstEvent.staff_pax) !== '' && firstEvent.staff_pax != null ? Number(firstEvent.staff_pax) : undefined,
        reference_source: isCreateFlow ? createForm.reference_source : wizardLeadData.reference_source || '',
        selected_package_id: isCreateFlow ? (createForm.selected_package_id || selectedPkgIds[0] || '') : (wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || selectedLead?.Select_Package_Option || ''),
        events: finalEventsList
      });

      let reloadedEvents = finalEventsList;
      if (supabaseClient) {
        const { data: dbEvents, error: dbErr } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', currentLeadId)
          .order('created_at', { ascending: true });
          
        if (!dbErr && dbEvents && dbEvents.length > 0) {
          reloadedEvents = dbEvents as LeadEvent[];
          if (isCreateFlow) {
            setCreateEvents(reloadedEvents);
          } else {
            setCrmEvents(reloadedEvents);
          }
        }
      }

      if (isCreateFlow) {
        // Await confirmation from Supabase that the lead and events are persisted before initializing Step 3
        if (supabaseClient && currentLeadId) {
          try {
            await supabaseClient
              .from('leads')
              .select('lead_id')
              .eq('lead_id', currentLeadId)
              .maybeSingle();
          } catch (refetchErr) {
            console.warn("Silent confirmation before Step 3 failed:", refetchErr);
          }
        }

        if (selectedPkgIds.length === 0) {
          setSelectedPkgIds(['Custom Package']);
          setWizardLeadData(prev => ({ ...prev, selected_package_id: 'Custom Package' }));
        }
        setWizardStep(3);
      } else {
        const newCompleted = Math.max(crmHighestStep, 2);
        setCrmHighestStep(newCompleted);
        if (selectedLead) {
          localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));
        }

        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            events: reloadedEvents
          };
        });

        setCrmWizardStep(3);
      }

      showToastMsg("✅ Event Details Saved Successfully", "success");
    } catch (err: any) {
      console.error("Step 2 direct save failed:", err);
      showToastMsg(`Failed to save event details: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep3FollowUp = async () => {
    const isCreateFlow = activeTab === 'create';
    const currentLeadId = isCreateFlow ? createdLeadId : selectedLead?.lead_id;

    if (!currentLeadId) {
      showToastMsg("Lead record not found.", "error");
      return;
    }
    if (!step3FollowUpDate) {
      showToastMsg("Follow-up Date is required.", "error");
      return;
    }

    setIsSaving(true);
    try {
      const fullNotes = step3FollowUpTime
        ? `[Time: ${step3FollowUpTime}] ${step3FollowUpNotes}`.trim()
        : step3FollowUpNotes;

      const currentPkgCost = Number(isCreateFlow ? (createForm.budget || finalTotal || 0) : (wizardLeadData.package_cost || selectedLead?.budget || 0));

      const previousStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'Create Quote') : 'Create Quote';
      const prevRank = getStatusRank(previousStatus);

      // Target stage:
      // If previous status rank < 2 (i.e. Create Quote or New Lead), update status to Quote Sent.
      // If previous status rank >= 2 (already Quote Sent, Quote Follow-up, Confirm Order, Lost Lead), preserve existing status!
      const targetStage: CurrentStage = (isCreateFlow || prevRank < 2) 
        ? ('Quote Sent' as CurrentStage) 
        : (previousStatus as CurrentStage);

      await updateLeadFollowUp(
        currentLeadId,
        targetStage,
        fullNotes || 'Quotation created & follow-up scheduled',
        step3FollowUpDate,
        currentPkgCost,
        fullNotes || 'Quotation sent'
      );

      await completeApprovedUnlockRequest(currentLeadId);

      localStorage.setItem(`follow_up_date_${currentLeadId}`, step3FollowUpDate);
      localStorage.setItem(`follow_up_notes_${currentLeadId}`, fullNotes);

      if (isCreateFlow) {
        setSalesStatus('Quote Sent' as CurrentStage);
        resetForm();
        setActiveTab('list');
      } else {
        setSelectedLead(null);
        setCrmWizardStep(1);
        setActiveTab('list');
      }

      showToastMsg("✅ Quotation & Follow-up saved! Status updated to Quote Sent.", "success");
      setShowStep3Popup(false);
    } catch (err: any) {
      console.error("Failed to save Step 3 follow-up:", err);
      showToastMsg(`Failed to save follow-up: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStep2FollowUp = async () => {
    const isCreateFlow = activeTab === 'create';
    const currentLeadId = isCreateFlow ? createdLeadId : selectedLead?.lead_id;
    if (!currentLeadId) {
      showToastMsg("Lead not initialized yet.", "error");
      return;
    }
    if (!step2FollowUpDate) {
      showToastMsg("Next Follow-up Date is mandatory.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const finalEventsList = (isCreateFlow ? [...createEvents] : [...crmEvents]);
      if (finalEventsList.length === 0) {
        showToastMsg("No events found to save.", "error");
        setIsSaving(false);
        return;
      }
      
      // Pre-validate and format all events in the finalEventsList
      for (const ev of finalEventsList) {
        if (!ev.event_type || ev.event_type.trim() === '') {
          showToastMsg("Please select Event Type for all events.", "error");
          setIsSaving(false); return;
        }
        if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
          showToastMsg("Please enter Event Name for 'Other' event types.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_date || ev.event_date.trim() === '') {
          showToastMsg("Please select Event Date for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_start_time || ev.event_start_time.trim() === '') {
          showToastMsg("Please select Event Start Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_end_time || ev.event_end_time.trim() === '') {
          showToastMsg("Please select Event End Time for all events.", "error");
          setIsSaving(false); return;
        }
        if (!ev.event_location || ev.event_location.trim() === '') {
          showToastMsg("Please enter Event Location for all events.", "error");
          setIsSaving(false); return;
        }
        
        try {
          ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        try {
          ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          setIsSaving(false); return;
        }
        
        const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
        if (dateTimeErrMsg) {
          showToastMsg(dateTimeErrMsg, "error");
          setIsSaving(false); return;
        }
      }

      const firstEvent = finalEventsList[0];

      const formattedEventTime = validateAndFormatTime(firstEvent.event_start_time, "Event Start Time");
      const formattedReportingTime = validateAndFormatTime(isCreateFlow ? reportingTime : wizardLeadData.reporting_time, "Reporting Time");

      // Save event details first
      await updateLead(currentLeadId, {
        event_type: firstEvent.event_type === 'Other' ? 'Other' : firstEvent.event_type,
        custom_event_name: firstEvent.event_name,
        custom_event_type: firstEvent.event_type === 'Other' ? firstEvent.event_name : undefined,
        event_date: firstEvent.event_date,
        Event_End_Date: firstEvent.event_end_date || (firstEvent as any).Event_End_Date || null,
        event_time: formattedEventTime || null,
        event_start_time: firstEvent.event_start_time || null,
        event_end_time: firstEvent.event_end_time || null,
        reporting_time: formattedReportingTime || null,
        event_location: firstEvent.event_location,
        google_maps_link: firstEvent.google_maps_link || '',
        lead_source: isCreateFlow ? createForm.lead_source : wizardLeadData.lead_source,
        event_shoot_type: firstEvent.event_shoot_type || '',
        client_residence_address: isCreateFlow ? createForm.client_residence_address : wizardLeadData.client_residence_address,
        city: isCreateFlow ? createForm.city : wizardLeadData.city,
        state: isCreateFlow ? createForm.state : wizardLeadData.state,
        pincode: isCreateFlow ? createForm.pincode : wizardLeadData.pincode,
        total_pax: Number(firstEvent.guest_pax) !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : undefined,
        guest_pax: Number(firstEvent.guest_pax) !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : undefined,
        staff_pax: Number(firstEvent.staff_pax) !== '' && firstEvent.staff_pax != null ? Number(firstEvent.staff_pax) : undefined,
        
        reference_source: isCreateFlow ? createForm.reference_source : wizardLeadData.reference_source || '',
        selected_package_id: isCreateFlow ? (createForm.selected_package_id || selectedPkgIds[0] || '') : (wizardLeadData.selected_package_id || wizardLeadData.selected_package_id || ''),
        events: finalEventsList
      });

      // Reload latest Event Details from the database to ensure we have the real IDs
      let reloadedEvents = finalEventsList;
      if (supabaseClient) {
        const { data: dbEvents, error: dbErr } = await supabaseClient
          .from('lead_events')
          .select('*')
          .eq('lead_id', currentLeadId)
          .order('created_at', { ascending: true });
          
        if (dbErr) {
          throw new Error(`Failed to verify saved events: ${dbErr.message || dbErr.details || 'Unknown database error'}`);
        }
        
        if (dbEvents && dbEvents.length > 0) {
          reloadedEvents = dbEvents as LeadEvent[];
          if (isCreateFlow) {
            setCreateEvents(reloadedEvents);
          } else {
            setCrmEvents(reloadedEvents);
          }
        }
      }

      const notesWithTag = appendCompletedStep(step2FollowUpNotes || 'Saved event details', 2);

      // Determine target status: If the current status is New Lead or empty, update to Follow Up. Otherwise preserve advanced status.
      const previousStatus = isCreateFlow ? 'New Lead' : (selectedLead ? getLeadCurrentStatus(selectedLead) : 'New Lead');
      const targetStatus = (previousStatus === 'New Lead' || !previousStatus) ? 'Follow Up' : previousStatus;

      // Update lead follow up and preserve/update status
      await updateLeadFollowUp(
        currentLeadId,
        targetStatus as CurrentStage,
        notesWithTag,
        step2FollowUpDate,
        Number(isCreateFlow ? (createForm.budget || 0) : (wizardLeadData.package_cost || selectedLead?.budget || 0)),
        step2FollowUpNotes || 'Saved event details'
      );

      localStorage.setItem(`follow_up_date_${currentLeadId}`, step2FollowUpDate);
      localStorage.setItem(`follow_up_notes_${currentLeadId}`, step2FollowUpNotes);

      if (isCreateFlow) {
        setSalesStatus(targetStatus as CurrentStage);
        setSelectedPkgIds(['Custom Package']);
        setWizardLeadData(prev => ({ ...prev, selected_package_id: 'Custom Package' }));
        setWizardStep(3);
      } else {
        const newCompleted = Math.max(crmHighestStep, 2);
        setCrmHighestStep(newCompleted);
        if (selectedLead) {
          localStorage.setItem(`crm_last_step_${selectedLead.lead_id}`, String(newCompleted));
        }

        // Locally update the status and remarks
        const timestamp = new Date().toISOString();
        const updatedRemarks = `${selectedLead?.remarks || ''}\n[Update ${timestamp.split('T')[0]}]: ${notesWithTag}. ${step2FollowUpNotes ? 'Neg Notes: ' + step2FollowUpNotes : ''}. Next follow-up: ${step2FollowUpDate}`;

        // Locally update the status
        setSelectedLead(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: targetStatus as CurrentStage,
            current_status: targetStatus,
            remarks: updatedRemarks,
            follow_up_notes: step2FollowUpNotes,
            next_follow_up_date: step2FollowUpDate,
            events: reloadedEvents
          };
        });

        setCrmWizardStep(3);
      }

      showToastMsg("✅ Event Details Saved Successfully", "success");
      setShowStep2Popup(false);
    } catch (err: any) {
      console.error("Step 2 Follow-up save failed:", err);
      const errorMsg = err?.details || err?.message || String(err);
      showToastMsg(`Save Failed: ${errorMsg}`, "error");
      showErrorHelper(
        "Step 2 Save & Next Failed",
        errorMsg,
        "handleSaveStep2FollowUp",
        currentLeadId,
        "Check event details and try again.",
        err
      );
      setTimeout(() => {
        document.getElementById('error_details_modal')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLostLead = async () => {
    if (!selectedLead) return;
    const finalReason = lostReason === 'Other' ? otherLostReason : lostReason;
    if (!finalReason || finalReason.trim() === '') {
      showToastMsg("Lost Reason is mandatory.", "error");
      return;
    }
    if (!lostNotes || lostNotes.trim() === '') {
      showToastMsg("Lost Notes are mandatory.", "error");
      return;
    }
    setIsSaving(true);
    try {
      await updateLead(selectedLead.lead_id, {
        status: 'Lost Lead',
        current_status: 'Lost Lead',
        remarks: `Lost Reason: ${finalReason}. Notes: ${lostNotes}`,
        "Lost_Reason": finalReason,
        "Lost_Notes": lostNotes,
        lost_reason: finalReason,
        lost_notes: lostNotes,
        follow_up_notes: finalReason
      } as any);

      await updateLeadFollowUp(
        selectedLead.lead_id,
        'Lost Lead',
        finalReason,
        '',
        Number(selectedLead.package_price || selectedLead.budget || 0),
        lostNotes
      );

      showToastMsg("Lead status set to Lost successfully.", "success");
      setShowLostModal(false);
      setSelectedLead(null);
    } catch (err: any) {
      console.error("Failed to set lead as lost:", err);
      showToastMsg(err.message || String(err), "error");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleSubmitUnlockRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnlockLead) return;
    
    if (unlockRequestReason === 'Other' && !unlockRequestCustomReason.trim()) {
      showToastMsg("Please enter a custom reason.", "error");
      return;
    }
    
    setIsSaving(true);
    
    try {
      if (!supabaseClient) {
        throw new Error("Supabase database client is not initialized.");
      }

      const order = orders.find(o => o.lead_id === selectedUnlockLead.lead_id);
      const orderId = order?.order_id || (selectedUnlockLead as any).order_id || selectedUnlockLead.lead_id || 'ORD-UNKNOWN';
      
      // 1. Prevent Duplicate Requests: Check if a Pending request already exists
      const { data: existingPending, error: checkErr } = await supabaseClient
        .from('unlock_requests')
        .select('*')
        .or(`lead_id.eq.${selectedUnlockLead.lead_id},order_id.eq.${orderId}`)
        .eq('request_status', 'Pending');

      if (checkErr) {
        console.error("Error checking existing pending unlock requests:", checkErr);
      }

      const localPending = unlockRequests.find((r: any) => 
        (r.lead_id === selectedUnlockLead.lead_id || r.order_id === orderId) &&
        (r.status === 'Pending' || r.request_status === 'Pending')
      );

      if ((existingPending && existingPending.length > 0) || localPending) {
        showToastMsg("An Unlock Request is already pending Business Owner approval.", "error");
        setIsSaving(false);
        return;
      }

      const fullReason = unlockRequestReason === 'Other' ? unlockRequestCustomReason.trim() : unlockRequestReason;

      const unlockRequestPayload = {
        lead_id: selectedUnlockLead.lead_id,
        order_id: orderId,
        requested_by_user_id: currentUser?.id || 'sales-user',
        requested_by_name: currentUser?.name || 'Sales Staff',
        requested_by_role: currentUser?.role || 'Sales',
        business_owner_user_id: 'BO-MAIN',
        chapter_id: selectedUnlockLead.chapter_id || 'DEFAULT',
        request_reason: fullReason || 'Unlock quotation for editing',
        request_status: 'Pending',
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      // 2. Save to Supabase: MUST succeed
      const { data: insertedData, error: reqErr } = await supabaseClient
        .from('unlock_requests')
        .insert([unlockRequestPayload])
        .select();

      if (reqErr) {
        console.error("Supabase unlock_requests insert failed:", reqErr);
        throw new Error(`Database insert failed: ${reqErr.message}`);
      }

      if (!insertedData || insertedData.length === 0) {
        throw new Error("Database insert did not return confirmation. Request not saved.");
      }



      // 4. Send notification to Business Owner
      if (addNotification) {
        try {
          const payload = {
            title: unlockRequestReason,
            message: `New unlock request received for ${selectedUnlockLead.customer_name || 'Lead'}.`,
            notification_type: 'Quotation Unlock Request',
            recipient_role: 'Business Owner',
            project_id: orderId,
            task_id: 'Pending',
            priority: 'High',
            action_url: JSON.stringify({
              lead_id: selectedUnlockLead.lead_id,
              customer_name: selectedUnlockLead.customer_name,
              mobile: selectedUnlockLead.mobile,
              sales_staff_id: currentUser?.id || '',
              sales_staff_name: currentUser?.name || '',
              sales_staff_mobile: currentUser?.mobile || ''
            })
          };
          await addNotification(payload);
        } catch (notifErr) {
          console.error("Notification error:", notifErr);
        }
      }
      
      const normalizedNewRecord = {
        ...insertedData[0],
        status: 'Pending',
        request_status: 'Pending',
        reason: fullReason,
        request_reason: fullReason,
        sales_staff_name: currentUser?.name || 'Sales Staff',
        sales_staff_id: currentUser?.id || 'sales-user',
        customer_name: selectedUnlockLead.customer_name || 'Unknown'
      };

      setUnlockRequests(prev => [
        ...prev.filter(r => r.lead_id !== selectedUnlockLead.lead_id && r.order_id !== orderId),
        normalizedNewRecord
      ]);

      showToastMsg("Unlock request submitted successfully.", "success");
      setShowUnlockRequestModal(false);
      setSelectedUnlockLead(null);
    } catch (err: any) {
      console.error("Failed to submit unlock request:", err);
      showToastMsg(err.message || String(err), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelLead = async () => {
    const targetLeadId = createdLeadId || selectedLead?.lead_id;
    if (!targetLeadId) {
      showToastMsg("No lead found to cancel.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const existingLead = leads.find(l => l.lead_id === targetLeadId) || selectedLead;
      const leadBudget = existingLead?.budget || 0;

      const finalReason = "Cancelled";
      const cancellationNotes = createdLeadId ? "Cancelled during Step 2 creation" : "Cancelled during Operations configuration";

      let finalEventsList = [...(createdLeadId ? createEvents : crmEvents)];
      if (finalEventsList.length === 0 && (eventForm.event_type || eventForm.event_name || eventForm.event_date || eventForm.event_location)) {
        finalEventsList.push({
          id: `EV-${Math.floor(1000 + Math.random() * 9000)}`,
          event_type: eventForm.event_type || '',
          event_name: eventForm.event_name || '',
          event_event_shoot_type: eventForm.event_shoot_type || '',
          event_date: eventForm.event_date || '',
          event_start_time: eventForm.event_start_time || '',
          event_end_time: eventForm.event_end_time || '',
          event_location: eventForm.event_location || '',
          google_maps_link: eventForm.google_maps_link || '',
          guest_pax: eventForm.guest_pax || '',
          staff_pax: eventForm.staff_pax || '',
          event_start_date: eventForm.event_date || '',
          event_end_date: eventForm.event_end_date || ''
        } as any);
      }
      const firstEvent = finalEventsList[0] || {};
      const payload: any = {
        status: 'Lost Lead',
        current_status: 'Lost Lead',
        remarks: `Lost Reason: ${finalReason}. Notes: ${cancellationNotes}`,
        "Lost_Reason": finalReason,
        "Lost_Notes": cancellationNotes,
        lost_reason: finalReason,
        lost_notes: cancellationNotes,
        
        client_residence_address: createForm.client_residence_address || existingLead?.client_residence_address || '',
        city: createForm.city || existingLead?.city || '',
        state: createForm.state || existingLead?.state || '',
        pincode: createForm.pincode || existingLead?.pincode || '',
        
        event_type: firstEvent.event_type || '',
        custom_event_name: firstEvent.event_name || '',
        event_date: firstEvent.event_date || '',
        event_start_time: firstEvent.event_start_time || null,
        event_end_time: firstEvent.event_end_time || null,
        event_location: firstEvent.event_location || '',
        google_maps_link: firstEvent.google_maps_link || '',
        event_shoot_type: firstEvent.event_shoot_type || '',
        guest_pax: Number(firstEvent.guest_pax) !== '' && firstEvent.guest_pax != null ? Number(firstEvent.guest_pax) : undefined,
        staff_pax: Number(firstEvent.staff_pax) !== '' && firstEvent.staff_pax != null ? Number(firstEvent.staff_pax) : undefined,
        
        next_follow_up_date: step2FollowUpDate || undefined,
        follow_up_notes: step2FollowUpNotes || undefined,
        
        events: finalEventsList
      };

      await updateLead(targetLeadId, payload);

      await updateLeadFollowUp(
        targetLeadId,
        'Lost Lead',
        finalReason,
        step2FollowUpDate || '',
        Number(leadBudget),
        cancellationNotes
      );

      showToastMsg("Lead marked as Lost successfully.", "success");
      setShowCancelConfirmPopup(false);
      resetForm();
      setActiveTab('list');
    } catch (err: any) {
      console.error("Error marking lead as Lost:", err);
      showToastMsg(`Failed to mark lead as Lost: ${err.message || err}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // On-change/blur handler for phone/email inputs to detect repeat customers
  const handleCheckExistingCustomer = (type: 'phone' | 'email', value: string) => {
    if (!value || value.length < 5) return;
    const parsedCustomers = getCustomers(leads, orders, payments || []);
    
    const matched = parsedCustomers.find(c => {
      if (type === 'phone') {
        const cleanInput = String(value).replace(/[^\d]/g, '').slice(-10);
        if (!cleanInput || cleanInput.length < 10) return false;
        const cleanMobile = String(c.mobile || '').replace(/[^\d]/g, '').slice(-10);
        const cleanAlt = String(c.alternate_mobile || '').replace(/[^\d]/g, '').slice(-10);
        return cleanInput === cleanMobile || (cleanAlt && cleanInput === cleanAlt);
      } else {
        const cleanInput = value.trim().toLowerCase();
        if (!cleanInput.includes('@')) return false;
        return c.email && c.email.trim().toLowerCase() === cleanInput;
      }
    });

    if (matched) {
      setDetectedCustomer(matched);
      setShowDetectionPopup(true);
    }
  };

  // Handle repeat bookings (Pre-fills customized data and issues a Lead AND dynamic Order immediately)
  const handleExecuteQuickReorder = async (cust: any) => {
    if (!reorderForm.event_date) {
      alert('Please specify the event date for the repeat customer booking.');
      return;
    }

    const newLeadId = await addLead({
      customer_name: cust.customer_name,
      mobile: cust.mobile,
      alternate_mobile: cust.alternate_mobile || undefined,
      whatsapp_number: cust.whatsapp_number || cust.mobile,
      email: cust.email,
      address: cust.address,
      city: cust.city,
      state: cust.state,
      pincode: cust.pincode,
      client_residence_address: cust.client_residence_address,
      lead_source: 'Repeat Customer Desk',
      event_type: reorderForm.event_type,
      custom_event_name: reorderForm.event_type === 'Other' ? reorderForm.custom_event_name : undefined,
      custom_event_type: reorderForm.event_type === 'Other' ? reorderForm.custom_event_name : undefined,
      event_date: reorderForm.event_date,
      event_time: reorderForm.event_time,
      event_location: reorderForm.event_location,
      budget: Number(reorderForm.quotation_amount),
      remarks: `Dynamic Repeat reservation. [CUST_ID: ${cust.customer_id}]`
    });

    const newOrderId = await confirmOrder(
      newLeadId,
      reorderForm.package_name,
      Number(reorderForm.quotation_amount),
      Number(reorderForm.advance_received)
    );

    alert(`Success! Repeat booking completed.\nNew Lead ID: ${newLeadId}\nNew Order ID: ${newOrderId}\nSame Customer ID: ${cust.customer_id}`);

    // Reset forms and view
    setShowDetectionPopup(false);
    setIsQuickReorderView(false);
    setDetectedCustomer(null);
    setReorderForm({
      event_type: '',
      custom_event_name: '',
      custom_event_type: '',
      event_date: '',
      event_time: '',
      event_location: '',
      package_name: '',
      quotation_amount: 0,
      advance_received: 0,
    });
    setActiveTab('list');
  };

  // Wizard action helpers and handlers
  const autoScrollToFormHeader = () => {
    const el = document.getElementById('create_lead_form_heading');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const formEl = document.getElementById('create_lead_form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const getRemarksPayload = (formRemarks: string, intNotes: string, fDate: string, wNum: string, adr: string, cty: string, resAdr?: string) => {
    let result = '';
    if (wNum) result += `WhatsApp: ${wNum}\n`;
    if (adr) result += `Event Venue: ${adr}\n`;
    if (resAdr) result += `Residence: ${resAdr}\n`;
    if (cty) result += `City: ${cty}\n`;
    if (fDate) result += `Follow-up Date: ${fDate}\n`;
    if (intNotes) result += `Internal Notes: ${intNotes}\n`;
    if (formRemarks) result += `Remarks: ${formRemarks}\n`;
    
    if (selectedPkgIds.length > 0) {
      result += `\n--- Selected Package Customizations ---\n`;
      selectedPkgIds.forEach(id => {
        const p = PACKAGES_LIST.flatMap(cat => cat.items).find(item => item.id === id);
        if (p) {
          result += `Package: ${p.name}\n`;
          result += `  Custom Price: ₹${(pkgPrices[id] !== undefined ? pkgPrices[id] : p.cost).toLocaleString('en-IN')}\n`;
          result += `  Deliverables: ${pkgDeliverables[id] || 'N/A'}\n`;
          result += `  Notes: ${pkgNotes[id] || 'N/A'}\n`;
        }
      });
    }
    return result;
  };

  const handleSaveEventForm = (isCrm: boolean = !!selectedLead, addAnother: boolean = false) => {
    if (isCrm && isCrmLocked) {
      showToastMsg(
        isMultiEventLead
          ? "All events have ended. This CRM is now locked."
          : "Event has ended. This CRM is now locked.",
        "error"
      );
      return;
    }
    if (isCrm && editingEventId) {
      const evToEdit = crmEvents.find(e => e.id === editingEventId);
      if (evToEdit && checkIsEventEnded(evToEdit)) {
        showToastMsg("Event has ended. This event is locked.", "error");
        return;
      }
    }
    if (!eventForm.event_type) {
      showValidationError("input_event_type", "Event Type is required.");
      return;
    }
    if (!eventForm.event_date) {
      showValidationError("input_event_date", "Event Date is required.");
      return;
    }
    if (!eventForm.event_location.trim()) {
      showValidationError("input_event_location", "Event Location is required.");
      return;
    }

    const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
    if (dateTimeErrMsg) {
      showToastMsg(dateTimeErrMsg, "error");
      return;
    }

    const guestPaxVal = eventForm.guest_pax !== '' ? Math.max(0, parseInt(String(eventForm.guest_pax)) || 0) : '';
    const staffPaxVal = eventForm.staff_pax !== '' ? Math.max(0, parseInt(String(eventForm.staff_pax)) || 0) : '';

    const eventData = {
      ...eventForm,
      guest_pax: guestPaxVal,
      staff_pax: staffPaxVal,
      event_start_date: eventForm.event_date,
      event_end_date: eventForm.event_end_date || ''
    };

    const savedEventType = eventForm.event_type;

    if (isCrm) {
      if (editingEventId) {
        setCrmEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...(eventData as any), id: editingEventId } : ev));
        showToastMsg("Event updated in list.", "success");
      } else {
        const newEv: LeadEvent = {
          ...(eventData as any),
          id: `EV-${Math.floor(1000 + Math.random() * 9000)}`
        };
        setCrmEvents(prev => [...prev, newEv]);
        showToastMsg("Event added to list.", "success");
      }
    } else {
      if (editingEventId) {
        setCreateEvents(prev => prev.map(ev => ev.id === editingEventId ? { ...(eventData as any), id: editingEventId } : ev));
        showToastMsg("Event updated in list.", "success");
      } else {
        const newEv: LeadEvent = {
          ...(eventData as any),
          id: `EV-${Math.floor(1000 + Math.random() * 9000)}`
        };
        setCreateEvents(prev => [...prev, newEv]);
        showToastMsg("Event added to list.", "success");
      }
    }

    setEditingEventId(null);

    if (addAnother) {
      setEventForm({
        event_type: '',
        event_name: '',
        event_shoot_type: '',
        event_date: '',
        event_start_time: '',
        event_end_time: '',
        event_location: '',
        google_maps_link: '',
        guest_pax: "" as any,
        staff_pax: "" as any,
        event_start_date: '',
        event_end_date: ''
      });
      setShowEventForm(true);
    } else {
      setShowEventForm(false);
    }
  };

  const handleEditEvent = (ev: LeadEvent) => {
    if (isCrmLocked) {
      showToastMsg(
        isMultiEventLead
          ? "All events have ended. This CRM is now locked."
          : "Event has ended. This CRM is now locked.",
        "error"
      );
      return;
    }
    if (checkIsEventEnded(ev)) {
      showToastMsg("Event has ended. This event is locked.", "error");
      return;
    }
    setEditingEventId(ev.id);
    const startDate = ev.event_start_date || ev.event_date || '';
    const endDate = ev.event_end_date || (ev as any).Event_End_Date || (ev as any).Event_end_date || '';
    const startTime = ev.event_start_time || (ev as any).start_time || (ev as any).event_time || '';
    const endTime = ev.event_end_time || (ev as any).end_time || '';
    const location = ev.event_location || (ev as any).location || (ev as any).venue_address || '';
    const maps = ev.google_maps_link || (ev as any).maps_link || '';

    setEventForm({
      event_type: ev.event_type || '',
      event_name: ev.event_name || '',
      event_shoot_type: ev.event_shoot_type || '',
      event_date: startDate,
      event_start_date: startDate,
      event_end_date: endDate,
      event_start_time: startTime,
      event_end_time: endTime,
      event_location: location,
      google_maps_link: maps,
      guest_pax: ev.guest_pax !== null && ev.guest_pax !== undefined ? ev.guest_pax : ('' as any),
      staff_pax: ev.staff_pax !== null && ev.staff_pax !== undefined ? ev.staff_pax : ('' as any),
      reporting_date: ev.reporting_date || '',
      reporting_time: ev.reporting_time || ''
    });
    setShowEventForm(true);
  };

  const handleDeleteEvent = (id: string, isCrm: boolean = !!selectedLead) => {
    if (isCrm) {
      if (isCrmLocked) {
        showToastMsg(
          isMultiEventLead
            ? "All events have ended. This CRM is now locked."
            : "Event has ended. This CRM is now locked.",
          "error"
        );
        return;
      }
      const evToDelete = crmEvents.find(e => e.id === id);
      if (evToDelete && checkIsEventEnded(evToDelete)) {
        showToastMsg("Event has ended. This event is locked.", "error");
        return;
      }
      setCrmEvents(prev => prev.filter(ev => ev.id !== id));
    } else {
      setCreateEvents(prev => prev.filter(ev => ev.id !== id));
    }
    // Clean up event-specific inclusions and deliverables
    const purgeKeys = (record: Record<string, string[]>) => {
      const next = { ...record };
      Object.keys(next).forEach(k => {
        if (k === id || k.endsWith(`_${id}`) || k.includes(id)) {
          delete next[k];
        }
      });
      return next;
    };
    setEditableInclusions(prev => purgeKeys(prev));
    setEditableDeliverables(prev => purgeKeys(prev));
    showToastMsg("Event removed from list.", "success");
  };

  const handleAddNewEventClick = (isCrm: boolean = !!selectedLead) => {
    if (isCrm && isCrmLocked) {
      showToastMsg(
        isMultiEventLead
          ? "All events have ended. This CRM is now locked."
          : "Event has ended. This CRM is now locked.",
        "error"
      );
      return;
    }
    setEditingEventId(null);
    setEventForm({
      event_type: '',
      event_name: '',
      event_shoot_type: '',
      event_date: '',
      event_start_time: '',
      event_end_time: '',
      event_location: '',
      google_maps_link: '',
      guest_pax: "" as any,
      staff_pax: "" as any,
      event_start_date: '',
      event_end_date: ''
    });
    setShowEventForm(true);
  };

  const formatDDMMYYYY = (dateStr: string | undefined | null): string => {
    if (!dateStr) return 'N/A';
    const clean = dateStr.trim();
    if (!clean || clean === '—' || clean === 'N/A') return 'N/A';
    return formatDateDDMMYY(clean) || 'N/A';
  };

  const convertTo24Hour = (timeStr: string | undefined | null): string => {
    if (!timeStr) return '';
    const clean = timeStr.trim().toUpperCase();
    if (!clean) return '';

    // Match 12-hour AM/PM format (e.g., "08:00 AM", "8:00:00 AM", "12:30 PM", "01:00:00 PM")
    const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const period = ampmMatch[3];

      if (period === 'PM' && hours < 12) {
        hours += 12;
      } else if (period === 'AM' && hours === 12) {
        hours = 0;
      }

      const hh = String(hours).padStart(2, '0');
      return `${hh}:${minutes}`;
    }

    // Check if it's in 24-hour format with or without seconds (e.g., "14:30", "14:30:00", "8:30:00")
    const hhmmssMatch = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmmssMatch) {
      const hh = String(parseInt(hhmmssMatch[1], 10)).padStart(2, '0');
      const mm = hhmmssMatch[2];
      return `${hh}:${mm}`;
    }

    return '';
  };

  const convertTo12Hour = (timeStr: string | undefined | null): string => {
    if (!timeStr) return '';
    const clean = timeStr.trim();
    if (!clean) return '';

    // If it already has AM/PM, format nicely
    if (clean.toUpperCase().includes('AM') || clean.toUpperCase().includes('PM')) {
      const ampmMatch = clean.toUpperCase().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/);
      if (ampmMatch) {
        const hh = String(parseInt(ampmMatch[1], 10)).padStart(2, '0');
        const mm = ampmMatch[2];
        const period = ampmMatch[3];
        return `${hh}:${mm} ${period}`;
      }
      return clean;
    }

    // Match 24-hour format HH:MM or HH:MM:SS
    const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return clean;
    }

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    if (hours === 0) {
      hours = 12;
    }

    const hh = String(hours).padStart(2, '0');
    return `${hh}:${minutes} ${period}`;
  };

  const parseDateParts = (dStr: string | undefined | null): { year: number; month: number; day: number } | null => {
    if (!dStr) return null;
    const clean = dStr.trim();
    if (!clean) return null;

    // YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10);
      const day = parseInt(ymdMatch[3], 10);
      if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);
      if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }

    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate()
      };
    }

    return null;
  };

  const parseTimeParts = (tStr: string | undefined | null): { hours: number; minutes: number } | null => {
    if (!tStr) return null;
    const clean = tStr.trim();
    if (!clean) return null;

    const t24 = convertTo24Hour(clean);
    if (!t24) return null;

    const parts = t24.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (!isNaN(hours) && !isNaN(minutes)) {
        return { hours, minutes };
      }
    }
    return null;
  };

  const buildDateTime = (
    dateStr: string | undefined | null,
    timeStr: string | undefined | null,
    defaultTime: { hours: number; minutes: number }
  ): Date | null => {
    const dParts = parseDateParts(dateStr);
    if (!dParts) return null;

    const tParts = parseTimeParts(timeStr) || defaultTime;
    return new Date(dParts.year, dParts.month - 1, dParts.day, tParts.hours, tParts.minutes, 0, 0);
  };

  const normalizeDateStr = (dStr: string | undefined | null): string => {
    const parts = parseDateParts(dStr);
    if (!parts) return dStr ? dStr.trim() : '';
    const y = parts.year;
    const m = String(parts.month).padStart(2, '0');
    const d = String(parts.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getEventDateTimeErrorMessage = (
    startDate: string | undefined | null,
    endDate: string | undefined | null,
    startTime: string | undefined | null,
    endTime: string | undefined | null
  ): string | null => {
    if (!startDate || startDate.trim() === '') return null;

    const startParts = parseDateParts(startDate);
    if (!startParts) return null;

    const effectiveEndDate = endDate && endDate.trim() !== '' ? endDate : startDate;
    const endParts = parseDateParts(effectiveEndDate);
    if (!endParts) return null;

    // Rule 3 – Check if End Date is earlier than Start Date
    if (
      startParts.year > endParts.year ||
      (startParts.year === endParts.year && startParts.month > endParts.month) ||
      (startParts.year === endParts.year && startParts.month === endParts.month && startParts.day > endParts.day)
    ) {
      return "Event End Date cannot be earlier than Event Start Date.";
    }

    const isSameDate =
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      startParts.day === endParts.day;

    // Rule 1 – If Start Date and End Date are the same date
    if (isSameDate) {
      const startT = parseTimeParts(startTime);
      const endT = parseTimeParts(endTime);
      if (startT && endT) {
        const startMin = startT.hours * 60 + startT.minutes;
        const endMin = endT.hours * 60 + endT.minutes;
        if (endMin <= startMin) {
          return "End Time must be later than Start Time when the Event Start Date and Event End Date are the same.";
        }
      }
    }

    // Rule 2 – Different Start Date & End Date (End Date > Start Date): any End Time allowed
    return null;
  };

  const isEventDateTimeInvalid = (
    startDate: string | undefined | null,
    endDate: string | undefined | null,
    startTime: string | undefined | null,
    endTime: string | undefined | null
  ): boolean => {
    return getEventDateTimeErrorMessage(startDate, endDate, startTime, endTime) !== null;
  };

  const isTimeEarlier = (start: string | undefined | null, end: string | undefined | null): boolean => {
    return isEventDateTimeInvalid(eventForm.event_date, eventForm.event_end_date, start, end);
  };

  const renderEventDetailsSection = (isCrm: boolean) => {
    const eventsList = isCrm ? crmEvents : createEvents;
    const isNewFormVisible = !editingEventId && (showEventForm || eventsList.length === 0);

    const renderFormFields = (isEditingThisEvent: boolean) => (
      <div className="space-y-4">
        {/* Event Type */}
        <div className="text-left">
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Event Type *
          </label>
          <select
            id="input_event_type"
            value={eventForm.event_type}
            onChange={(e) => {
              const val = e.target.value;
              setEventForm(prev => ({
                ...prev,
                event_type: val,
                event_name: prev.event_name || ''
              }));
            }}
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-all cursor-pointer font-bold"
          >
            <option value="">Select Event Type</option>
            {synchronizedEventTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* Conditional Event Details fields displayed only after Event Type is selected */}
        {eventForm.event_type && eventForm.event_type !== '' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
            {/* Event Name */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Name
              </label>
              <input
                id="input_event_name"
                type="text"
                placeholder="e.g. Sangeet, Haldi, Reception"
                value={eventForm.event_name}
                onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            {/* Event Date */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Date *
              </label>
              <input
                id="input_event_date"
                type="date"
                required
                value={eventForm.event_date}
                onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none font-mono"
              />
            </div>

            {/* Event Start Time */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Start Time
              </label>
              <TimePicker12Hour
                id="input_event_start_time"
                value={convertTo24Hour(eventForm.event_start_time)}
                onChange={(val24) => {
                  const val12 = convertTo12Hour(val24);
                  setEventForm({ ...eventForm, event_start_time: val12 });
                }}
              />
            </div>

            {/* Event End Date */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event End Date
              </label>
              <input
                id="input_event_end_date"
                type="date"
                value={eventForm.event_end_date || ''}
                onChange={(e) => setEventForm({ ...eventForm, event_end_date: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none font-mono cursor-pointer"
              />
            </div>

            {/* Event End Time */}
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event End Time
              </label>
              <TimePicker12Hour
                id="input_event_end_time"
                value={convertTo24Hour(eventForm.event_end_time)}
                onChange={(val24) => {
                  const val12 = convertTo12Hour(val24);
                  setEventForm({ ...eventForm, event_end_time: val12 });
                }}
              />
              {(() => {
                const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
                return dateTimeErrMsg ? (
                  <p className="text-[11px] text-rose-400 mt-1 animate-fade-in font-medium">
                    {dateTimeErrMsg}
                  </p>
                ) : null;
              })()}
            </div>

            {/* Event Location - Multiline Address */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Event Location * (Venue Address)
              </label>
              <textarea
                required
                rows={3}
                placeholder="Enter the full event location and venue address details"
                value={eventForm.event_location}
                onChange={(e) => setEventForm({ ...eventForm, event_location: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none"
              />
            </div>

            {/* Google Maps Link */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Google Maps Location Link (Optional)
              </label>
              <input
                type="url"
                placeholder="e.g. https://maps.app.goo.gl/..."
                value={eventForm.google_maps_link}
                onChange={(e) => setEventForm({ ...eventForm, google_maps_link: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
              />
            </div>

            {/* Guest Pax */}
            <div className="sm:col-span-2 text-left">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Guest Pax
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 150"
                value={eventForm.guest_pax}
                onChange={(e) => setEventForm({ ...eventForm, guest_pax: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg py-2 px-3 text-xs text-slate-100 focus:outline-none font-mono"
              />
            </div>

            {/* Save Event Buttons */}
            <div className="sm:col-span-2 flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowEventForm(false);
                  setEditingEventId(null);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {isEditingThisEvent ? (
                <button
                  type="button"
                  onClick={() => handleSaveEventForm(isCrm, false)}
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                >
                  Update Event
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSaveEventForm(isCrm, false)}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    Save Event
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveEventForm(isCrm, true)}
                    className="bg-cyan-600 hover:bg-cyan-500 text-slate-100 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                  >
                    Save & Add Another Event
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-4">
        {/* Render Event Cards */}
        {eventsList.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
              Added Events ({eventsList.length})
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {eventsList.map((ev, idx) => {
                const isEditingThisEvent = editingEventId === ev.id;
                const isCollapsed = collapsedEventIds[ev.id] ?? true;
                const startDateStr = formatDDMMYYYY(ev.event_start_date || ev.event_date);
                const endDateRaw = ev.event_end_date || (ev as any).Event_End_Date || '';
                const endDateStr = endDateRaw ? formatDDMMYYYY(endDateRaw) : 'N/A';
                const startTimeStr = ev.event_start_time ? convertTo12Hour(ev.event_start_time) : 'N/A';
                const endTimeStr = ev.event_end_time ? convertTo12Hour(ev.event_end_time) : 'N/A';

                const guestPaxVal = ev.guest_pax !== '' && ev.guest_pax !== null && ev.guest_pax !== undefined ? ev.guest_pax : 'N/A';
                const staffPaxVal = ev.staff_pax !== '' && ev.staff_pax !== null && ev.staff_pax !== undefined ? ev.staff_pax : 'N/A';
                const isEventLocked = isCrmLocked || checkIsEventEnded(ev);

                const dateTimeSummary = (() => {
                  const startPart = `${startDateStr} • ${startTimeStr}`;
                  if (endDateRaw && endDateStr !== 'N/A') {
                    return `${startPart} → ${endDateStr} • ${endTimeStr}`;
                  } else if (endTimeStr !== 'N/A') {
                    return `${startPart} → ${endTimeStr}`;
                  }
                  return startPart;
                })();

                if (isEditingThisEvent) {
                  return (
                    <div key={ev.id} className="bg-slate-900 border border-cyan-500/50 rounded-xl p-4 space-y-4 shadow-lg animate-fade-in text-left">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Edit className="w-3.5 h-3.5" /> Edit Event {idx + 1}: {ev.event_name || ev.event_type}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEventId(null);
                            setShowEventForm(false);
                          }}
                          className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      {renderFormFields(true)}
                    </div>
                  );
                }

                return (
                  <div key={ev.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm transition-all duration-200">
                    <div 
                      className="flex items-center justify-between p-3.5 bg-slate-950/40 cursor-pointer select-none border-b border-slate-800/40 hover:bg-slate-950/60 transition-colors"
                      onClick={() => setCollapsedEventIds(prev => ({ ...prev, [ev.id]: !isCollapsed }))}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="bg-cyan-500/10 text-cyan-400 p-1.5 rounded-lg shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="text-left space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-100">{ev.event_name || `Event ${idx + 1}`}</span>
                            <span className="text-xs text-slate-500 font-mono">|</span>
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono font-bold">
                              {ev.event_type}
                            </span>
                            {isEventLocked && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                <span>🔒</span>
                                <span>Event has ended. This event is locked.</span>
                              </span>
                            )}
                          </div>

                          {/* Show compact summary ONLY when COLLAPSED */}
                          {isCollapsed && (
                            <>
                              <p className="text-[11px] text-slate-300 font-mono">
                                {dateTimeSummary}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                Guest Pax: <span className="text-slate-200 font-semibold">{guestPaxVal}</span>
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={isEventLocked}
                          onClick={() => {
                            if (isEventLocked) {
                              showToastMsg("Event has ended. This event is locked.", "error");
                              return;
                            }
                            handleEditEvent(ev);
                          }}
                          className={`p-1.5 rounded transition-colors ${
                            isEventLocked
                              ? 'opacity-30 cursor-not-allowed text-slate-600'
                              : 'hover:bg-slate-800 text-slate-300 hover:text-cyan-400 cursor-pointer'
                          }`}
                          title={isEventLocked ? "Event has ended. This event is locked." : "Edit Event"}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isEventLocked}
                          onClick={() => {
                            if (isEventLocked) {
                              showToastMsg("Event has ended. This event is locked.", "error");
                              return;
                            }
                            handleDeleteEvent(ev.id, isCrm);
                          }}
                          className={`p-1.5 rounded transition-colors ${
                            isEventLocked
                              ? 'opacity-30 cursor-not-allowed text-slate-600'
                              : 'hover:bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer'
                          }`}
                          title={isEventLocked ? "Event has ended. This event is locked." : "Remove Event"}
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollapsedEventIds(prev => ({ ...prev, [ev.id]: !isCollapsed }))}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        >
                          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="p-4 bg-slate-900/50 text-xs text-slate-300 space-y-3">
                        {isEventLocked && (
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-mono font-bold flex items-center gap-2">
                            <span>🔒</span>
                            <span>Event has ended. This event is locked.</span>
                          </div>
                        )}
                        {/* Event Name & Type Info Header if name differs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Event Name</span>
                            <span className="text-slate-100 font-semibold">{ev.event_name || `Event ${idx + 1}`}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Event Type</span>
                            <span className="text-slate-100 font-semibold">{ev.event_type}</span>
                          </div>
                          {(ev.event_shoot_type || (ev as any).shoot_type) && (
                            <div>
                              <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Event Shoot Type</span>
                              <span className="text-slate-100 font-semibold">{ev.event_shoot_type || (ev as any).shoot_type}</span>
                            </div>
                          )}
                        </div>

                        {/* Dates & Times Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Start Date</span>
                            <span className="text-slate-200 font-semibold">{startDateStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Start Time</span>
                            <span className="text-slate-200 font-semibold">{startTimeStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">End Date</span>
                            <span className="text-slate-200 font-semibold">{endDateStr}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">End Time</span>
                            <span className="text-slate-200 font-semibold">{endTimeStr}</span>
                          </div>
                        </div>

                        {/* Pax Info Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Guest Pax</span>
                            <span className="text-slate-200 font-semibold">{guestPaxVal}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Staff Pax</span>
                            <span className="text-slate-200 font-semibold">{staffPaxVal}</span>
                          </div>
                        </div>

                        {/* Reporting Info if present */}
                        {(ev.reporting_date || ev.reporting_time) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850/60 font-mono">
                            {ev.reporting_date && (
                              <div>
                                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Reporting Date</span>
                                <span className="text-slate-200 font-semibold">{formatDDMMYYYY(ev.reporting_date)}</span>
                              </div>
                            )}
                            {ev.reporting_time && (
                              <div>
                                <span className="text-slate-400 block text-[10px] font-sans font-bold uppercase tracking-wider mb-0.5">Reporting Time</span>
                                <span className="text-slate-200 font-semibold">{convertTo12Hour(ev.reporting_time)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Venue Address */}
                        <div className="border-t border-slate-800/40 pt-2.5 text-left">
                          <span className="text-slate-400 block mb-1 text-[10px] font-sans font-bold uppercase tracking-wider">Venue Address / Location:</span>
                          <p className="text-slate-200 bg-slate-950/20 p-2 rounded border border-slate-850/50 whitespace-pre-wrap font-mono">
                            {ev.event_location || 'N/A'}
                          </p>
                        </div>

                        {/* Google Maps Link */}
                        {ev.google_maps_link && (
                          <div className="flex items-center gap-1.5 text-cyan-400 text-left pt-1 font-mono text-[11px]">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <a 
                              href={ev.google_maps_link} 
                              target="_blank" 
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer" 
                              className="hover:underline break-all"
                            >
                              {ev.google_maps_link}
                            </a>
                          </div>
                        )}

                        {/* Assigned Staff if present */}
                        {ev.assigned_staff_names && (
                          <div className="border-t border-slate-800/40 pt-2 text-left font-mono">
                            <span className="text-slate-400 block mb-0.5 text-[10px] font-sans font-bold uppercase tracking-wider">Assigned Staff:</span>
                            <span className="text-slate-200">{ev.assigned_staff_names}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inline Event Form for New Event */}
        {isNewFormVisible ? (
          <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 space-y-4 animate-fade-in text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                Event Details
              </span>
              {eventsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowEventForm(false);
                    setEditingEventId(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
            {renderFormFields(false)}
          </div>
        ) : (
          /* Add Another Event Button */
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => handleAddNewEventClick(isCrm)}
              className="flex items-center gap-1.5 border border-dashed border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 bg-slate-900/30 px-4 py-2.5 rounded-lg text-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Another Event</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleWizardNext = async () => {
    if (isSaving) return;

    let finalUser: any = null;

    if (wizardStep === 1) {
      if (!createForm.mobile) {
        showValidationError("input_mobile", "Phone Number is required.");
        return;
      }
      if (!createForm.lead_source || createForm.lead_source === '') {
        showValidationError("input_lead_source", "Lead Source is required.");
        return;
      }

      // Check Supabase Authentication and Session before creating lead
      if (supabaseClient) {
        try {
          const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
          const { data: userData, error: userErr } = await supabaseClient.auth.getUser();

          const session = sessionData?.session;
          const authUser = userData?.user;

          console.log('SESSION', session);
          console.log('USER', authUser);

          if (sessionErr || userErr) {
            console.warn("Session/user fetch error:", sessionErr || userErr);
          }

          // If BOTH session and authUser are null AND we don't have a currentUser in React state
          if (!session && !authUser && !currentUser) {
            showToastMsg("Please login again.", "error");
            return;
          }

          // Check if session is expired
          const isExpired = session?.expires_at ? (session.expires_at <= Math.floor(Date.now() / 1000)) : false;
          if (isExpired && !authUser) {
            showToastMsg("Session expired.", "error");
            return;
          }

          // Users Table Lookup
          const currentUid = authUser?.id || session?.user?.id || currentUser?.id;
          const emailFromAuth = authUser?.email || session?.user?.email || currentUser?.email;

          let dbUser: any = null;
          if (currentUid) {
            const { data: userById, error: dbUserErr } = await supabaseClient
              .from('users')
              .select('*')
              .eq('id', currentUid)
              .maybeSingle();

            dbUser = userById;
            if (dbUserErr) {
              console.warn("Users table lookup failed in UI:", dbUserErr.message);
            }
          }

          if (!dbUser && emailFromAuth) {
            const { data: dbUserByEmail } = await supabaseClient
              .from('users')
              .select('*')
              .ilike('email', emailFromAuth.trim())
              .maybeSingle();
            
            if (dbUserByEmail && currentUid) {
              console.log("Aligning user profile ID during lead creation...");
              await supabaseClient
                .from('users')
                .update({ id: currentUid })
                .eq('email', dbUserByEmail.email);
              dbUser = { ...dbUserByEmail, id: currentUid };
            } else if (dbUserByEmail) {
              dbUser = dbUserByEmail;
            }
          }

          // If dbUser has a different email than emailFromAuth, align it!
          if (dbUser && currentUid && emailFromAuth) {
            const dbEmailNorm = (dbUser.email || '').toLowerCase().trim();
            const authEmailNorm = emailFromAuth.toLowerCase().trim();
            if (dbEmailNorm !== authEmailNorm) {
              console.log("Aligning user profile email with authenticated email...");
              await supabaseClient
                .from('users')
                .update({ email: emailFromAuth.trim() })
                .eq('id', currentUid);
              dbUser = { ...dbUser, email: emailFromAuth.trim() };
            }
          }

          finalUser = currentUser;
          if (dbUser) {
            finalUser = mapUserFieldsFromDb(dbUser);
          }

          if (!finalUser) {
            showToastMsg("User record missing from users table.", "error");
            return;
          }

          // Robust case-insensitive comparison and self-healing alignment
          if (emailFromAuth && finalUser.email) {
            const finalEmailNorm = finalUser.email.toLowerCase().trim();
            const authEmailNorm = emailFromAuth.toLowerCase().trim();
            if (finalEmailNorm !== authEmailNorm) {
              console.log("Healing email mismatch between local user record and auth...");
              finalUser.email = emailFromAuth.trim();
              if (finalUser.id) {
                await supabaseClient
                  .from('users')
                  .update({ email: emailFromAuth.trim() })
                  .eq('id', finalUser.id);
              }
            }
          }

          if (!finalUser.role) {
            showToastMsg("User role not loaded correctly.", "error");
            return;
          }

          if (!finalUser.active) {
            showToastMsg("User account is deactivated.", "error");
            return;
          }

          if (finalUser.role !== 'Sales Team' && finalUser.role !== 'Business Owner') {
            showToastMsg("User does not have permission to create quotations.", "error");
            return;
          }
        } catch (authErr: any) {
          showToastMsg(`Authentication error: ${authErr.message || authErr}`, "error");
          return;
        }
      } else {
        if (!currentUser) {
          showToastMsg("Please login again.", "error");
          return;
        }
        finalUser = currentUser;
        if (currentUser.role !== 'Sales Team' && currentUser.role !== 'Business Owner') {
          showToastMsg("User does not have permission to create quotations.", "error");
          return;
        }
      }

      const mobileVal = String(createForm.mobile || '').trim();
      if (!/^\d{10}$/.test(mobileVal)) {
        showToastMsg("Please enter a valid 10-digit mobile number.", "error");
        return;
      }
      if (createForm.email && createForm.email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(createForm.email.trim())) {
          showToastMsg("Please enter a valid email address.", "error");
          return;
        }
      }

      if (!createdLeadId && !bypassDuplicateCheckRef.current) {
        try {
          setIsSaving(true);
          const { data: existingLeads, error: lookupError } = await supabaseClient
            .from('leads')
            .select('customer_name, created_date, status, event_date')
            .eq('mobile', mobileVal);

          if (lookupError) {
            throw lookupError;
          }

          if (existingLeads && existingLeads.length > 0) {
            // Find the first matching customer
            const duplicate = existingLeads[0];
            setDuplicateCustomerInfo({
              customer_name: duplicate.customer_name || 'N/A',
              created_date: duplicate.created_date || 'N/A',
              status: duplicate.status || 'N/A',
              event_date: duplicate.event_date || 'N/A'
            });
            setShowDuplicateWarning(true);
            setIsSaving(false);
            return;
          }
        } catch (err: any) {
          setIsSaving(false);
          setSaveErrorPopup({
            title: "Error",
            message: "Unable to check existing customer. Please try again."
          });
          return;
        } finally {
          setIsSaving(false);
        }
      }

      try {
        setIsSaving(true);
        const finalSource = createForm.lead_source === 'Other' ? 'Other' : createForm.lead_source;
        const customLeadSourceName = createForm.lead_source === 'Other' && otherSource.trim() !== '' ? otherSource.trim() : null;
        let finalId = createdLeadId;
        if (!createdLeadId) {
          const newId = await addLead({
            customer_name: createForm.customer_name || '',
            mobile: createForm.mobile,
            alternate_mobile: (createForm.alternate_mobile && String(createForm.alternate_mobile).trim() !== '' && String(createForm.alternate_mobile).trim() !== '+91') ? String(createForm.alternate_mobile) : undefined,
            email: createForm.email,
            lead_source: finalSource,
            Specify_Custom_Lead_Source_Name: customLeadSourceName,
            whatsapp_number: createForm.whatsapp_number,
            address: createForm.address,
            city: createForm.city,
            state: createForm.state,
            pincode: createForm.pincode,
            client_residence_address: createForm.client_residence_address,
            
            desired_event_shoot_type: createForm.desired_event_shoot_type,
            total_pax: createForm.total_pax !== '' ? Number(createForm.total_pax) : undefined,
            reference_source: createForm.reference_source,
            booking_status: createForm.booking_status || undefined,
            event_type: createForm.event_type || '',
            event_date: createForm.event_date || '',
            event_time: createForm.event_time || '',
            event_location: createForm.event_location || '',
            budget: Number(createForm.budget) || 0,
            remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
            next_follow_up_date: followUpDate || undefined,
          follow_up_notes: internalNotes || undefined,
            
          });
          setCreatedLeadId(newId);
          finalId = newId;
          console.log(`Created lead with ID: ${newId}`);
        } else {
          await updateLead(createdLeadId, {
            customer_name: createForm.customer_name || '',
            mobile: createForm.mobile,
            alternate_mobile: (createForm.alternate_mobile && String(createForm.alternate_mobile).trim() !== '' && String(createForm.alternate_mobile).trim() !== '+91') ? String(createForm.alternate_mobile) : undefined,
            email: createForm.email,
            lead_source: finalSource,
            Specify_Custom_Lead_Source_Name: customLeadSourceName,
            whatsapp_number: createForm.whatsapp_number,
            address: createForm.address,
            city: createForm.city,
            state: createForm.state,
            pincode: createForm.pincode,
            client_residence_address: createForm.client_residence_address,
            desired_event_shoot_type: createForm.desired_event_shoot_type,
            total_pax: createForm.total_pax !== '' ? Number(createForm.total_pax) : undefined,
            reference_source: createForm.reference_source,
            booking_status: createForm.booking_status || undefined,
            remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
            next_follow_up_date: followUpDate || undefined,
          follow_up_notes: internalNotes || undefined,
            
          });
        }
        const isEdit = !!createdLeadId;

        const newLeadObj: Lead = {
          lead_id: finalId || '',
          customer_name: createForm.customer_name || '',
          mobile: createForm.mobile,
          alternate_mobile: (createForm.alternate_mobile && String(createForm.alternate_mobile).trim() !== '' && String(createForm.alternate_mobile).trim() !== '+91') ? String(createForm.alternate_mobile) : undefined,
          email: createForm.email,
          lead_source: finalSource,
            Specify_Custom_Lead_Source_Name: customLeadSourceName,
          whatsapp_number: createForm.whatsapp_number,
          address: createForm.address,
          city: createForm.city,
          state: createForm.state,
          pincode: createForm.pincode,
          client_residence_address: createForm.client_residence_address,
          
          desired_event_shoot_type: createForm.desired_event_shoot_type,
          total_pax: createForm.total_pax !== '' ? Number(createForm.total_pax) : undefined,
          reference_source: createForm.reference_source,
          booking_status: createForm.booking_status || 'Pending',
          event_type: createForm.event_type || 'Other',
          event_date: createForm.event_date || new Date().toISOString().split('T')[0],
          event_time: createForm.event_time || '12:00',
          event_location: createForm.event_location || 'TBD',
          budget: Number(createForm.budget) || 0,
          remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
          next_follow_up_date: followUpDate || undefined,
          follow_up_notes: internalNotes || undefined,

          status: 'Create Quote',
          created_date: new Date().toISOString().split('T')[0],
          sales_person: finalUser?.name || currentUser?.name || 'Sales Team',
          created_by: finalUser?.name || currentUser?.name || 'Sales Team'
        };

        // Stay in Create Lead form, and advance to Step 2
        setWizardStep(2);

        showToastMsg("Inbound quotation created successfully! Continuing to Step 2.", "success");
      } catch (err: any) {
        console.error("Step 1 saving failed:", err);
  
      const errMsg = err.message || String(err);
      
      if (errMsg.includes('FATAL_MISSING_COLUMN')) {
        const parts = errMsg.split('||');
        const table = parts[1] || 'leads';
        const col = parts[2] || 'Unknown';
        const sql = `ALTER TABLE "${table}" ADD COLUMN "${col}" numeric;`;
        const colType = col === 'Specify_Custom_Lead_Source_Name' ? 'text' : 'numeric';
        const properSql = `ALTER TABLE "${table}" ADD COLUMN "${col}" ${colType};`;
        
        showToastMsg(`CRITICAL DB ERROR:\nTable: ${table}\nMissing Column: ${col}\nSuggested SQL: ${properSql}`, "error");
        setIsSaving(false);
        return;
      }

        let displayedMsg = errMsg;
        
        const lowerMsg = errMsg.toLowerCase();
        if (lowerMsg.includes("row-level security policy") || lowerMsg.includes("rls") || lowerMsg.includes("security policy")) {
          displayedMsg = "Lead insert blocked by RLS policy.";
        } else if (lowerMsg.includes("user record missing") || lowerMsg.includes("missing from users table") || lowerMsg.includes("missing from users")) {
          displayedMsg = "User record missing from users table.";
        } else if (lowerMsg.includes("session expired") || lowerMsg.includes("jwt expired")) {
          displayedMsg = "Session expired.";
        } else if (lowerMsg.includes("permission") || lowerMsg.includes("permission denied")) {
          displayedMsg = "User does not have permission to create quotations.";
        } else if (lowerMsg.includes("login") || lowerMsg.includes("unauthenticated") || lowerMsg.includes("jwt")) {
          displayedMsg = "Please login again.";
        } else {
          displayedMsg = errMsg;
        }
        
        showToastMsg(displayedMsg, "error");
      } finally {
        setIsSaving(false);
      }
    }

    else if (wizardStep === 2) {
      let finalEventsList = [...createEvents];
      
      // If eventForm is visible or there are no events in the list, validate and add
      if (showEventForm || finalEventsList.length === 0) {
        if (!eventForm.event_type || eventForm.event_type === '') {
          showValidationError("input_event_type", "Please select Event Type.");
          return;
        }
        if (!eventForm.event_date || eventForm.event_date === '') {
          showValidationError("input_event_date", "Please select Event Date.");
          return;
        }
        if (!eventForm.event_location || eventForm.event_location.trim() === '') {
          showValidationError("input_event_location", "Please enter Event Location.");
          return;
        }
        const dateTimeErrMsg = getEventDateTimeErrorMessage(eventForm.event_date, eventForm.event_end_date, eventForm.event_start_time, eventForm.event_end_time);
        if (dateTimeErrMsg) {
          showValidationError("input_event_end_time", dateTimeErrMsg);
          return;
        }

        const guestPaxVal = eventForm.guest_pax !== '' ? Math.max(0, parseInt(String(eventForm.guest_pax)) || 0) : '';
        const staffPaxVal = eventForm.staff_pax !== '' ? Math.max(0, parseInt(String(eventForm.staff_pax)) || 0) : '';

        const eventData = {
          ...eventForm,
          guest_pax: guestPaxVal,
          staff_pax: staffPaxVal,
          event_start_date: eventForm.event_date,
          event_end_date: eventForm.event_end_date || ''
        };

        if (editingEventId) {
          finalEventsList = finalEventsList.map(ev => ev.id === editingEventId ? { ...eventData, id: editingEventId } : ev);
        } else {
          finalEventsList.push({
            ...eventData,
            id: `EV-${Math.floor(1000 + Math.random() * 9000)}`
          });
        }
        
        setCreateEvents(finalEventsList);
        setEditingEventId(null);
        setShowEventForm(false);
      }

      if (finalEventsList.length === 0) {
        showToastMsg("Please add at least one event.", "error");
        return;
      }

      // Pre-validate and format all events in the finalEventsList
      for (const ev of finalEventsList) {
        if (!ev.event_type || ev.event_type.trim() === '') {
          showToastMsg("Please select Event Type for all events.", "error");
          return;
        }
        if (ev.event_type === 'Other' && (!ev.event_name || ev.event_name.trim() === '')) {
          showToastMsg("Please enter Event Name for 'Other' event types.", "error");
          return;
        }
        if (!ev.event_date || ev.event_date.trim() === '') {
          showToastMsg("Please select Event Date for all events.", "error");
          return;
        }
        if (!ev.event_start_time || ev.event_start_time.trim() === '') {
          showToastMsg("Please select Event Start Time for all events.", "error");
          return;
        }
        if (!ev.event_end_time || ev.event_end_time.trim() === '') {
          showToastMsg("Please select Event End Time for all events.", "error");
          return;
        }
        if (!ev.event_location || ev.event_location.trim() === '') {
          showToastMsg("Please enter Event Location for all events.", "error");
          return;
        }
        
        try {
          ev.event_start_time = validateAndFormatTime(ev.event_start_time, "Event Start Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          return;
        }
        try {
          ev.event_end_time = validateAndFormatTime(ev.event_end_time, "Event End Time") || '';
        } catch (err: any) {
          showToastMsg(err.message, "error");
          return;
        }
        
        const dateTimeErrMsg = getEventDateTimeErrorMessage(ev.event_date, ev.event_end_date, ev.event_start_time, ev.event_end_time);
        if (dateTimeErrMsg) {
          showToastMsg(dateTimeErrMsg, "error");
          return;
        }
      }

      const firstEvent = finalEventsList[0];

      try {
        await handleSaveStep2Direct();
      } catch (err: any) {
        console.error("Step 2 saving failed:", err);
  
      const errMsg = err.message || String(err);
      
      if (errMsg.includes('FATAL_MISSING_COLUMN')) {
        const parts = errMsg.split('||');
        const table = parts[1] || 'leads';
        const col = parts[2] || 'Unknown';
        const sql = `ALTER TABLE "${table}" ADD COLUMN "${col}" numeric;`;
        const colType = col === 'Specify_Custom_Lead_Source_Name' ? 'text' : 'numeric';
        const properSql = `ALTER TABLE "${table}" ADD COLUMN "${col}" ${colType};`;
        
        showToastMsg(`CRITICAL DB ERROR:\nTable: ${table}\nMissing Column: ${col}\nSuggested SQL: ${properSql}`, "error");
        setIsSaving(false);
        return;
      }

        let displayedMsg = errMsg;
        if (errMsg.toLowerCase().includes("database") || errMsg.toLowerCase().includes("connection") || errMsg.toLowerCase().includes("failed to fetch") || errMsg.toLowerCase().includes("supabase")) {
          displayedMsg = "Database save failed: connection error.";
        } else {
          displayedMsg = `Unable to save event details: ${errMsg}`;
        }
        showToastMsg(displayedMsg, "error");
      } finally {
        setIsSaving(false);
      }
    }

  };

  const handleStatusSave = async () => {
    if (isSaving) return;
    const finalStatus = salesStatus || 'New Lead';
    try {
      setIsSaving(true);

      // Save Packages
      const selectedPkgs = PACKAGES_LIST.flatMap(cat => cat.items).filter(item => selectedPkgIds.includes(item.id));
      if (selectedPkgIds.length > 0) {
        const packagesPayload = selectedPkgs.map(pkg => ({
          package_id: pkg.id,
          package_name: pkg.name,
          package_cost: pkgPrices[pkg.id] !== undefined ? pkgPrices[pkg.id] : pkg.cost,
          quantity: 1,
          total_amount: pkgPrices[pkg.id] !== undefined ? pkgPrices[pkg.id] : pkg.cost,
          discount: leadDiscount,
          final_amount: pkgPrices[pkg.id] !== undefined ? pkgPrices[pkg.id] : pkg.cost,
          deliverables_description: pkgDeliverables[pkg.id] || pkg.deliverables || 'N/A',
          notes_special_customizations: pkgNotes[pkg.id] || '',
          additional_services_cost: 0,
          team_members: pkg.team_members || '',
          deliverables: pkg.deliverables || ''
        }));
        await saveLeadPackages(createdLeadId!, packagesPayload);
      }

      const activePkgId = createForm.selected_package_id || selectedPkgIds[0] || 'Custom Package';
      const activeEventsList = createEvents.length > 0 ? createEvents : [];
      const { teamMembersText, deliverablesText } = buildStep3EventPayloads(
        activePkgId,
        activeEventsList,
        editableInclusions,
        editableDeliverables
      );

      await updateLead(createdLeadId!, {
        status: finalStatus as CurrentStage,
        budget: finalTotal,
        package_price: finalTotal,
        Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
        Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
        Final_Quotation_Amount: finalTotal,
        Final_Package_Amount: finalTotal,
        final_package_amount: finalTotal,
        selected_package_id: activePkgId as any,
        Select_Package_Option: activePkgId,
        deliverables_description: deliverablesText || selectedPkgs.map(p => pkgDeliverables[p.id] || p.deliverables || 'N/A').join('\n'),
        notes_special_customizations: teamMembersText || selectedPkgs.map(p => pkgNotes[p.id] || '').join('\n'),
        sales_staff_name: salesStaffName,
        sales_staff_mobile: salesStaffMobile,
        client_residence_address: createForm.client_residence_address,
        city: createForm.city,
        state: createForm.state,
        pincode: createForm.pincode,
        desired_event_shoot_type: createForm.desired_event_shoot_type,
        remarks: getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
        next_follow_up_date: followUpDate || undefined,
        follow_up_notes: internalNotes || undefined,
        events: activeEventsList
      });

      setWizardLeadData(prev => ({
        ...prev,
        selected_package_id: activePkgId,
        Select_Package_Option: activePkgId,
        package_cost: finalTotal,
        package_price: finalTotal,
        final_amount: finalTotal,
        budget: finalTotal,
        final_quoted_amount: finalTotal,
        deliverables: deliverablesText,
        deliverables_description: deliverablesText
      }));

      const currentCreatedLead = leads.find(l => l.lead_id === createdLeadId);
      const syncedLeadObj: Lead = {
        ...(currentCreatedLead || {}),
        lead_id: createdLeadId!,
        customer_name: createForm.customer_name,
        mobile: createForm.mobile,
        whatsapp_number: createForm.whatsapp_number,
        status: finalStatus as CurrentStage,
        budget: finalTotal,
        package_price: finalTotal,
        Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
        Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
        Final_Quotation_Amount: finalTotal,
        Final_Package_Amount: finalTotal,
        final_package_amount: finalTotal,
        selected_package_id: activePkgId,
        Select_Package_Option: activePkgId,
        deliverables_description: deliverablesText,
        events: activeEventsList
      } as Lead;
      setSelectedLead(syncedLeadObj);

      showToastMsg("✅ Quotation created successfully.", "success");
      setStep3FollowUpDate(followUpDate || '');
      setStep3FollowUpTime('');
      setStep3FollowUpNotes(internalNotes || '');
      setShowStep3Popup(true);
    } catch (err: any) {
      console.error("Step 5 status save failed:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const targetLd = leads.find(l => l.lead_id === createdLeadId);
      const oldStatus = targetLd ? (targetLd.current_status || targetLd.status || 'New Lead') : null;
      const newStatus = finalStatus || undefined;

      logStatusUpdateError({
        leadId: createdLeadId || undefined,
        orderId: null,
        oldStatus,
        newStatus,
        updatePayload: {
          status: finalStatus,
          budget: finalTotal,
          package_price: finalTotal,
          Quotation_Discount: quoteDiscount === "" ? null : Number(quoteDiscount),
          Additional_Services_Cost: quoteAdditional === "" ? null : Number(quoteAdditional),
          Final_Quotation_Amount: finalTotal,
          
        },
        insertPayload: null,
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "Lead Stage Transition Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      alert(parsed.reason);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOrderConfirmedSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving) return;

    const targetLd = leads.find(l => l.lead_id === createdLeadId) || selectedLead;
    if (targetLd && !areReportingDetailsComplete(targetLd)) {
      openReportingDetailsModal(targetLd, "Please complete and save the Reporting Details before confirming the order.");
      return;
    }

    if (!confirmedEventDate) {
      showToastMsg("Please select Confirmed Event Date.", "error");
      return;
    }

    if (finalPackageAmount === undefined || finalPackageAmount === 0 || isNaN(finalPackageAmount)) {
      showToastMsg("Please enter Final Amount.", "error");
      return;
    }
    if (advanceReceived === undefined || isNaN(advanceReceived)) {
      showToastMsg("Please enter Advance Paid Amount.", "error");
      return;
    }

    try {
      setIsSaving(true);
      const selectedPkgsNames = selectedPkgs.map(p => p.name).join(' + ') || 'Custom Configured Coverage';
      await confirmOrder(
        createdLeadId!,
        selectedPkgsNames,
        Number(finalPackageAmount) || 0,
        Number(advanceReceived) || 0,
        confirmedEventDate,
        confirmedEventTime,
        'UPI / Cash / Bank Transfer',
        getRemarksPayload(createForm.remarks, internalNotes, followUpDate, createForm.whatsapp_number, createForm.address, createForm.city, createForm.client_residence_address),
        reportingTime
      );
      
      showToastMsg("Quotation created successfully.", "success");
      resetForm();
      setActiveTab('list');
    } catch (err: any) {
      console.error("Failed to commit confirmed order details:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const targetLd = leads.find(l => l.lead_id === createdLeadId);
      const oldStatus = targetLd ? (targetLd.current_status || targetLd.status || 'New Lead') : null;

      logStatusUpdateError({
        leadId: createdLeadId || undefined,
        orderId: null,
        oldStatus,
        newStatus: 'Order Confirmed',
        updatePayload: {
          status: 'Order Confirmed',
          event_date: confirmedEventDate,
          event_time: confirmedEventTime,
          reporting_time: reportingTime,
        },
        insertPayload: {
          order_status: 'Confirmed',
          current_stage: 'Order Confirmed',
          package_name: selectedPkgs.map(p => p.name).join(' + ') || 'Custom Configured Coverage',
          quotation_amount: finalPackageAmount,
          advance_received: advanceReceived,
        },
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "Order Confirmation Pipeline Transition Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      alert(parsed.reason);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateContinue = async () => {
    setShowDuplicateWarning(false);
    bypassDuplicateCheckRef.current = true;
    await handleWizardNext();
    bypassDuplicateCheckRef.current = false;
  };

  const handleDuplicateCancel = () => {
    setShowDuplicateWarning(false);
    setDuplicateCustomerInfo(null);
    bypassDuplicateCheckRef.current = false;
    resetForm();
    setActiveTab('list');
  };

  // Handle follow up submit
  const handleFollowUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    if (followUpForm.status === 'Order Confirmed' || followUpForm.status === 'Confirm Order') {
      if (!areReportingDetailsComplete(selectedLead)) {
        openReportingDetailsModal(selectedLead, "Please complete and save the Reporting Details before confirming the order.");
        return;
      }

      if (!followUpForm.event_date) {
        showToastMsg("Please select Confirmed Event Date.", "error");
        return;
      }

      if (followUpForm.quotation_amount === undefined || followUpForm.quotation_amount === 0 || isNaN(followUpForm.quotation_amount)) {
        showToastMsg("Please enter Final Amount.", "error");
        return;
      }
      if (followUpForm.advance_received === undefined || isNaN(followUpForm.advance_received) || Number(followUpForm.advance_received) <= 0) {
        showToastMsg("Please enter Advance Paid Amount.", "error");
        return;
      }
      if (!followUpForm.transaction_id || !followUpForm.transaction_id.trim()) {
        showToastMsg("Please enter Payment Tracking ID / Transaction Reference Number.", "error");
        return;
      }

      const packageName = packages?.find(p => String(p.package_id) === String(selectedLead.Select_Package_Option))?.package_name || selectedLead.Select_Package_Option || '';

      try {
        setIsSaving(true);
        await confirmOrder(
          selectedLead.lead_id,
          packageName,
          Number(followUpForm.quotation_amount),
          Number(followUpForm.advance_received),
          followUpForm.event_date,
          followUpForm.event_time,
          followUpForm.payment_mode || 'UPI',
          followUpForm.call_notes || 'Confirmed from CRM activity logger',
          followUpForm.reporting_time || '08:00',
          followUpForm.transaction_id
        );

        setSelectedLead(null);
        showToastMsg("Order Confirmed Successfully.", "success");
      } catch (err: any) {
        console.error("Failed to convert lead:", err);
        const errMsg = err?.message || String(err);
        const parsed = parseStatusUpdateError(errMsg);

        const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;

        logStatusUpdateError({
          leadId: selectedLead?.lead_id || undefined,
          orderId: null,
          oldStatus,
          newStatus: 'Order Confirmed',
          updatePayload: {
            status: 'Order Confirmed',
            remarks: followUpForm.call_notes
          },
          insertPayload: {
            order_status: 'Confirmed',
            current_stage: 'Order Confirmed',
            package_name: packageName,
            quotation_amount: Number(followUpForm.quotation_amount),
            advance_received: Number(followUpForm.advance_received),
          },
          dbResponse: null,
          fullError: err
        });

        setStatusError({
          title: "Follow-up Transition to Order Confirmed Failed",
          reason: parsed.reason,
          suggestedFix: parsed.suggestedFix
        });
        alert(parsed.reason);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!followUpForm.call_notes) {
      alert('Please fill in some Call Notes to update lead follow-up.');
      return;
    }

    try {
      setIsSaving(true);
      await updateLeadFollowUp(
        selectedLead.lead_id,
        followUpForm.status,
        followUpForm.call_notes,
        followUpForm.next_follow_up_date || '',
        Number(followUpForm.quotation_amount),
        followUpForm.negotiation_notes
      );

      // Refresh selected lead state
      setSelectedLead((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: followUpForm.status,
          budget: Number(followUpForm.quotation_amount),
        };
      });

      // Clear follow up text
      setFollowUpForm(prev => ({ ...prev, call_notes: '', negotiation_notes: '' }));
      alert('CRM Updated Successfully.');
    } catch (err: any) {
      console.error("Failed to update follow-up:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;

      logStatusUpdateError({
        leadId: selectedLead?.lead_id || undefined,
        orderId: null,
        oldStatus,
        newStatus: followUpForm.status,
        updatePayload: {
          status: followUpForm.status,
          budget: Number(followUpForm.quotation_amount),
          remarks: followUpForm.call_notes
        },
        insertPayload: null,
        dbResponse: null,
        fullError: err
      });

      setStatusError({
        title: "Follow-up Pipeline Status Update Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      alert(parsed.reason);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalReportingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    try {
      setIsSaving(true);
      
      const crmEvents = selectedLead.events || [];
      let updatedLeadFields: any = {};

      if (crmEvents.length > 0) {
        // Validate all events have required reporting details
        for (const ev of crmEvents) {
          const fd = finalReportingForm[ev.id] || { reporting_date: '', reporting_time: '' };
          if (!fd.reporting_date || !fd.reporting_date.trim() || !fd.reporting_time || !fd.reporting_time.trim()) {
            showToastMsg("Please complete Reporting Date and Reporting Time for all events.", "error");
            setIsSaving(false);
            return;
          }
        }

        // Save event-wise reporting details
        const updatedEvents = crmEvents.map(ev => {
          const fd = finalReportingForm[ev.id] || { reporting_date: '', reporting_time: '' };
          return {
            ...ev,
            reporting_date: fd.reporting_date,
            reporting_time: fd.reporting_time
          };
        });
        
        updatedLeadFields = {
          events: updatedEvents,
          Reporting_date: updatedEvents[0]?.reporting_date || '', // fallback
          reporting_time: updatedEvents[0]?.reporting_time || ''
        };
        await updateLead(selectedLead.lead_id, updatedLeadFields);
      } else {
        // Fallback for leads without explicit events
        const fd = finalReportingForm['default'] || { reporting_date: '', reporting_time: '' };
        if (!fd.reporting_date || !fd.reporting_date.trim() || !fd.reporting_time || !fd.reporting_time.trim()) {
          showToastMsg("Please complete Reporting Date and Reporting Time.", "error");
          setIsSaving(false);
          return;
        }

        updatedLeadFields = {
          Reporting_date: fd.reporting_date,
          reporting_time: fd.reporting_time
        };
        await updateLead(selectedLead.lead_id, updatedLeadFields);
      }

      const updatedLead = {
        ...selectedLead,
        ...updatedLeadFields
      };

      setShowFinalReportingModal(false);
      setSelectedLead(updatedLead);
      showToastMsg("Reporting Details Saved Successfully.", "success");

      // Auto-open Confirm Order modal once reporting details are saved
      const today = new Date().toISOString().split('T')[0];
      const linkedOrder = orders?.find(o => o.lead_id === updatedLead.lead_id);
      const linkedPayment = linkedOrder ? payments?.find(p => p.order_id === linkedOrder.order_id) : null;
      const calcAdvance = linkedPayment 
        ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
        : (linkedOrder 
            ? (linkedOrder.advance_received ?? 0) 
            : (updatedLead.advance_collected !== undefined && updatedLead.advance_collected !== null && updatedLead.advance_collected !== ''
                ? Number(updatedLead.advance_collected) 
                : 0));

      setConfirmForm(prev => {
        const step3Amt = getStep3FinalQuotationAmount(updatedLead, {
          dynamicFinalAmt,
          wizardLeadData,
          quotations: allQuotations,
          leads: allLeads,
          orders: allOrders,
          leadPackages,
          confirmFormQuotationAmount: prev.quotation_amount
        });
        return {
          ...prev,
          package_name: packages?.find((p) => String(p.package_id) === String(updatedLead.Select_Package_Option))?.package_name || updatedLead.Select_Package_Option || prev.package_name || '',
          quotation_amount: step3Amt || prev.quotation_amount || 0,
          advance_received: typeof calcAdvance === 'number' && !isNaN(calcAdvance) ? calcAdvance : ((prev.advance_received !== '' && prev.advance_received !== undefined && prev.advance_received !== null && !isNaN(Number(prev.advance_received))) ? Number(prev.advance_received) : 0),
          event_date: updatedLead.event_date || prev.event_date || today,
          event_time: updatedLead.event_time || prev.event_time || ''
        };
      });
      setShowConfirmModal(true);
    } catch (err) {
      console.error(err);
      showToastMsg("Failed to save Reporting Details.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Canonical Action column & Step 3 Confirm handler
  const handleConfirmOrderAction = (lead: Lead) => {
    if (setOpenDropdownLeadId) {
      setOpenDropdownLeadId(null);
    }
    handleSelectLead(lead);

    const today = new Date().toISOString().split('T')[0];
    const linkedOrder = orders?.find((o: any) => o.lead_id === lead.lead_id);
    const linkedPayment = linkedOrder ? payments?.find((p: any) => p.order_id === linkedOrder.order_id) : null;
    const calcAdvance = linkedPayment 
      ? ((linkedPayment.advance_received ?? 0) + (linkedPayment.final_payment_received ?? 0)) 
      : (linkedOrder 
          ? (linkedOrder.advance_received ?? 0) 
          : (lead.advance_collected !== undefined && lead.advance_collected !== null && lead.advance_collected !== ''
              ? Number(lead.advance_collected) 
              : 0));

    const step3Amt = getStep3FinalQuotationAmount(lead, {
      dynamicFinalAmt,
      wizardLeadData,
      quotations: allQuotations,
      leads: allLeads,
      orders: allOrders,
      leadPackages,
      confirmFormQuotationAmount: confirmForm.quotation_amount
    });

    setConfirmForm({
      ...confirmForm,
      package_name: packages?.find((p: any) => String(p.package_id) === String(lead.Select_Package_Option))?.package_name || lead.Select_Package_Option || '',
      quotation_amount: step3Amt || Number(lead.Final_Quotation_Amount) || Number((lead as any).final_quotation_amount) || 0,
      advance_received: calcAdvance,
      event_date: lead.event_date || (lead.events && lead.events[0]?.event_date) || today,
      event_time: lead.event_time || (lead.events && (lead.events[0]?.event_start_time || (lead.events[0] as any)?.event_time)) || ''
    });
    initEventsReporting(lead);
    setShowConfirmModal(true);
  };

  // Handle Order Confirmation Process
  const handleConfirmOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    if (!confirmForm.event_date) {
      showToastMsg("Please select Confirmed Event Date.", "error");
      return;
    }

    const effectiveFinalAmt = getStep3FinalQuotationAmount(selectedLead, {
      dynamicFinalAmt,
      wizardLeadData,
      quotations: allQuotations,
      leads: allLeads,
      orders: allOrders,
      leadPackages,
      confirmFormQuotationAmount: confirmForm.quotation_amount
    }) || Number(confirmForm.quotation_amount) || Number(selectedLead.Final_Quotation_Amount) || Number((selectedLead as any).final_quotation_amount) || 0;
    if (!effectiveFinalAmt || effectiveFinalAmt <= 0 || isNaN(effectiveFinalAmt)) {
      showToastMsg("Please enter Final Amount.", "error");
      return;
    }
    const numAdvance = (confirmForm.advance_received !== '' && confirmForm.advance_received !== undefined && confirmForm.advance_received !== null) ? Number(confirmForm.advance_received) : 0;
    if (isNaN(numAdvance) || numAdvance < 0) {
      showToastMsg("Please enter a valid Advance Paid Amount.", "error");
      return;
    }
    if (!confirmForm.transaction_id || !confirmForm.transaction_id.trim()) {
      showToastMsg("Please enter Payment Tracking ID / Transaction Reference Number.", "error");
      return;
    }

    // Validate that each event has a Reporting Date and Reporting Time
    const modalEvents = sortEventsAscending(
      (crmEvents && Array.isArray(crmEvents) && crmEvents.length > 0 && selectedLead?.lead_id)
        ? crmEvents
        : (selectedLead.events || [])
    );

    if (modalEvents.length > 0) {
      for (let i = 0; i < modalEvents.length; i++) {
        const ev = modalEvents[i];
        const key = ev.id || `ev_${i}`;
        const rep = eventsReporting[key] || {
          reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
          reporting_time: ev.reporting_time || selectedLead.reporting_time || ''
        };
        const evTitle = ev.event_name || ev.event_type || `Event ${i + 1}`;
        if (!rep?.reporting_date || !rep.reporting_date.trim()) {
          showToastMsg(`Please enter Reporting Date for ${evTitle}.`, "error");
          return;
        }
        if (!rep?.reporting_time || !rep.reporting_time.trim()) {
          showToastMsg(`Please enter Reporting Time for ${evTitle}.`, "error");
          return;
        }
      }
    } else {
      const rep = eventsReporting['default'] || {
        reporting_date: selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
        reporting_time: selectedLead.reporting_time || ''
      };
      if (!rep?.reporting_date || !rep.reporting_date.trim()) {
        showToastMsg("Please enter Reporting Date.", "error");
        return;
      }
      if (!rep?.reporting_time || !rep.reporting_time.trim()) {
        showToastMsg("Please enter Reporting Time.", "error");
        return;
      }
    }

    try {
      setIsSaving(true);

      // Save each event's reporting details to lead_events table in Supabase
      if (modalEvents.length > 0) {
        const updatedEvents = modalEvents.map((ev, idx) => {
          const key = ev.id || `ev_${idx}`;
          const rep = eventsReporting[key] || {
            reporting_date: ev.reporting_date || (ev as any).Reporting_date || ev.event_date || ev.event_start_date || selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
            reporting_time: ev.reporting_time || selectedLead.reporting_time || ''
          };
          return {
            ...ev,
            reporting_date: rep.reporting_date || ev.reporting_date || ev.event_date || '',
            reporting_time: rep.reporting_time || ev.reporting_time || ''
          };
        });

        await updateLead(selectedLead.lead_id, {
          events: updatedEvents,
          Reporting_date: updatedEvents[0]?.reporting_date || '',
          reporting_time: updatedEvents[0]?.reporting_time || ''
        });
      } else {
        const rep = eventsReporting['default'] || {
          reporting_date: selectedLead.Reporting_date || (selectedLead as any).reporting_date || selectedLead.event_date || '',
          reporting_time: selectedLead.reporting_time || ''
        };
        await updateLead(selectedLead.lead_id, {
          Reporting_date: rep.reporting_date,
          reporting_time: rep.reporting_time
        });
      }

      const firstRepTime = (modalEvents.length > 0)
        ? (eventsReporting[modalEvents[0].id || 'ev_0']?.reporting_time || modalEvents[0]?.reporting_time || selectedLead.reporting_time)
        : (eventsReporting['default']?.reporting_time || selectedLead.reporting_time);

      // Save Step 3 team members and deliverables to Supabase before confirming order
      const pkgId = wizardLeadData.selected_package_id || confirmForm.package_name || selectedLead.Select_Package_Option || 'Custom Package';
      const eventsForPayload = modalEvents.length > 0 ? modalEvents : (selectedLead.events || []);
      const { teamMembersJson, deliverablesJson, teamMembersText, deliverablesText } = buildStep3EventPayloads(
        pkgId,
        eventsForPayload,
        editableInclusions,
        editableDeliverables
      );
      const safeTeamMembersText = teamMembersText;
      const safeDeliverablesText = deliverablesText;
      const cleanPkgCost = Number(effectiveFinalAmt) || Number(confirmForm.quotation_amount) || Number(selectedLead.Final_Package_Amount) || 0;

      if (supabaseClient) {
        try {
          const { error: dbError } = await supabaseClient
            .from('leads')
            .update({
              deliverables_description: safeDeliverablesText,
              Team_member: safeTeamMembersText,
              Team_Members: safeTeamMembersText,
              Add_Deliverable: safeDeliverablesText,
              Add_Member: safeTeamMembersText,
              Select_Package_Option: pkgId,
              Final_Quotation_Amount: cleanPkgCost,
              Final_Package_Amount: cleanPkgCost
            })
            .eq('lead_id', selectedLead.lead_id);

          if (dbError) {
            console.warn("Direct Supabase leads update warning on order confirmation:", dbError);
          }
        } catch (leadUpdateErr) {
          console.warn("Direct Supabase update exception on order confirmation:", leadUpdateErr);
        }

        try {
          const rawPackagePayloadConfirm = {
            lead_id: selectedLead.lead_id,
            package_id: pkgId,
            package_name: confirmForm.package_name || pkgId,
            package_cost: cleanPkgCost || 0,
            quantity: 1,
            total_amount: cleanPkgCost,
            final_amount: effectiveFinalAmt,
            Team_Members_Included: teamMembersJson,
            editable_inclusions: editableInclusions,
            deliverables_descriptionn: deliverablesJson,
            deliverables_description: deliverablesText,
            editable_deliverables: editableDeliverables,
            updated_at: new Date().toISOString()
          };

          const { payload: packagePayloadConfirm, isValid, teamMembersValid, deliverablesValid, issues } = verifyAndFormatLeadPackagePayload(
            rawPackagePayloadConfirm,
            'Order Confirmation [Confirm Order]'
          );

          const { data: existingLpsC, error: fetchErrC } = await supabaseClient
            .from('lead_packages')
            .select('*')
            .eq('lead_id', selectedLead.lead_id);

          if (fetchErrC) {
            console.warn("[lead_packages confirm] Error querying existing lead_packages:", fetchErrC);
          }

          let targetLpIdC = `LP-${selectedLead.lead_id}-${pkgId}`;
          if (existingLpsC && existingLpsC.length > 0) {
            const matched = existingLpsC.find(lp => String(lp.package_id) === String(pkgId)) || existingLpsC[0];
            targetLpIdC = matched.lead_package_id || matched.id || targetLpIdC;
            console.log(`🚀 [Supabase API Call] Order Confirmation updating 'lead_packages' (ID: "${targetLpIdC}"):`, packagePayloadConfirm);
            const { data: updateRes, error: updateErr } = await supabaseClient
              .from('lead_packages')
              .update(packagePayloadConfirm)
              .eq(matched.lead_package_id ? 'lead_package_id' : 'id', targetLpIdC)
              .select('*');

            if (updateErr) {
              console.error(`❌ [Supabase API Error] Order Confirmation error updating 'lead_packages':`, updateErr);
            } else {
              console.log(`✅ [Supabase API Success] Order Confirmation updated 'lead_packages' record:`, updateRes);
            }
          } else {
            console.log(`🚀 [Supabase API Call] Order Confirmation inserting 'lead_packages' (ID: "${targetLpIdC}"):`, packagePayloadConfirm);
            const { data: insertRes, error: insertErr } = await supabaseClient
              .from('lead_packages')
              .insert({
                ...packagePayloadConfirm,
                lead_package_id: targetLpIdC,
                created_at: new Date().toISOString()
              })
              .select('*');

            if (insertErr) {
              console.error(`❌ [Supabase API Error] Order Confirmation error inserting 'lead_packages':`, insertErr);
            } else {
              console.log(`✅ [Supabase API Success] Order Confirmation inserted 'lead_packages' record:`, insertRes);
            }
          }
        } catch (lpErr) {
          console.warn("Could not upsert lead_packages record on order confirmation:", lpErr);
        }
      }

      await confirmOrder(
        selectedLead.lead_id,
        confirmForm.package_name,
        effectiveFinalAmt,
        numAdvance,
        confirmForm.event_date,
        confirmForm.event_time,
        confirmForm.payment_mode,
        confirmForm.notes,
        firstRepTime,
        confirmForm.transaction_id
      );

      setShowConfirmModal(false);
      showToastMsg("Booking Confirmation saved successfully. Order transferred to Operations.", "success");
      setWizardLeadData(prev => ({
        ...prev,
        advance_received: numAdvance,
        status: 'Order Confirmed'
      }));
      setSalesStatus('Order Confirmed' as CurrentStage);
      setSelectedLead(null);
      if (activeTab === 'create') {
        resetForm();
        setActiveTab('list');
      }
    } catch (err: any) {
      console.error("Failed to convert order:", err);
      const errMsg = err?.message || String(err);
      const parsed = parseStatusUpdateError(errMsg);

      const oldStatus = selectedLead ? (selectedLead.current_status || selectedLead.status || 'New Lead') : null;

      try {
        logStatusUpdateError({
          leadId: selectedLead?.lead_id || null,
          orderId: null,
          oldStatus,
          newStatus: 'Order Confirmed',
          updatePayload: {
            status: 'Order Confirmed',
            event_date: confirmForm.event_date,
            event_time: confirmForm.event_time,
            reporting_time: undefined,
          },
          insertPayload: {
            order_status: 'Confirmed',
            current_stage: 'Order Confirmed',
            package_name: confirmForm.package_name,
            quotation_amount: Number(confirmForm.quotation_amount),
            advance_received: Number(confirmForm.advance_received),
          },
          dbResponse: null,
          fullError: err
        });
      } catch (logErr) {
        console.warn("Failed to log status update error:", logErr);
      }

      setStatusError({
        title: "Action Button Order Confirmation Failed",
        reason: parsed.reason,
        suggestedFix: parsed.suggestedFix
      });
      showToastMsg(parsed.reason || "Failed to confirm order.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Companion lead metadata parse
  const getFollowUpDate = (remarks?: string) => {
    if (!remarks) return null;
    const match = remarks.match(/Next follow-up:\s*(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  };

  const todayStr = '2026-06-10';

  const statCreatedQuotation = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Create Quote' || st === 'Created Quotation' || st === 'New Lead';
  }).length;
  const statQuotesSent = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Quote Sent' || st === 'Quotation Sent';
  }).length;
  const statQuoteFollowups = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Quote Follow-up' || st === 'Follow Up' || st === 'Follow-up';
  }).length;
  const statConfirmedOrders = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Confirm Order' || st === 'Order Confirmed';
  }).length;
  const statLeadLost = leads.filter(l => {
    const st = getLeadCurrentStatus(l);
    return st === 'Lead Lost' || st === 'Lost Lead';
  }).length;

  // Filter Leads List
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.customer_name.toLowerCase().includes(filterQuery.toLowerCase()) || 
      lead.lead_id.toLowerCase().includes(filterQuery.toLowerCase()) ||
      lead.mobile.includes(filterQuery);

    const matchesSource = filterSource === '' || lead.lead_source === filterSource;
    const leadStatus = getLeadCurrentStatus(lead);
    const matchesStatus = filterStatus === '' 
      ? true 
      : filterStatus === 'Overdue' 
        ? (() => {
            if (leadStatus !== 'Follow Up') return false;
            const fDate = getFollowUpDate(lead.remarks);
            return fDate ? fDate < todayStr : false;
          })()
        : (() => {
            const statusLower = leadStatus.toLowerCase().trim();
            const filterLower = filterStatus.toLowerCase().trim();
            if (filterLower === 'create quote' || filterLower === 'created quotation') {
              return statusLower === 'create quote' || statusLower === 'created quotation' || statusLower === 'new lead';
            }
            if (filterLower === 'quote sent') {
              return statusLower === 'quote sent' || statusLower === 'quotation sent';
            }
            if (filterLower === 'quote follow-up') {
              return statusLower === 'quote follow-up' || statusLower === 'follow up' || statusLower === 'follow-up';
            }
            if (filterLower === 'confirm order') {
              return statusLower === 'confirm order' || statusLower === 'order confirmed';
            }
            if (filterLower === 'lead lost') {
              return statusLower === 'lead lost' || statusLower === 'lost lead';
            }
            if (filterLower === 'customer review') {
              return statusLower === 'customer review' || statusLower === 'client review' || statusLower === 'client review sent';
            }
            if (filterLower === 'project completed') {
              return statusLower === 'project completed' || statusLower === 'project closed' || statusLower === 'completed' || statusLower === 'closed' || statusLower === 'project delivered' || statusLower === 'delivered' || statusLower === 'approved' || statusLower === 'final approval' || statusLower === 'client approved';
            }
            if (filterLower === 'approved') {
              return statusLower === 'approved' || statusLower === 'client approved';
            }
            if (filterLower === 'project delivered') {
              return statusLower === 'project delivered' || statusLower === 'delivered';
            }
            if (filterLower === 'project closed') {
              return statusLower === 'project closed' || statusLower === 'closed';
            }
            if (filterLower === 'new project received') {
              return statusLower === 'new project received' || statusLower === 'new order received';
            }
            if (filterLower === 'follow up') {
              return statusLower === 'follow up' || statusLower === 'follow-up';
            }
            return statusLower === filterLower;
          })();
    const matchesSales = filterSalesPerson === '' || lead.sales_person === filterSalesPerson;
    const matchesDate = filterDate === '' || lead.event_date === filterDate;

    let matchesDateRange = true;
    if (appliedStartDate) {
      matchesDateRange = matchesDateRange && (lead.created_date >= appliedStartDate);
    }
    if (appliedEndDate) {
      matchesDateRange = matchesDateRange && (lead.created_date <= appliedEndDate);
    }

    return matchesSearch && matchesSource && matchesStatus && matchesSales && matchesDate && matchesDateRange;
  }).sort((a, b) => {
    const parseRegistrationTimestamp = (leadObj: Lead): number => {
      const raw = leadObj.created_at || (leadObj as any).timestamp || (leadObj as any).created_time || leadObj.created_date || (leadObj as any).registered_date || (leadObj as any).registration_date || leadObj.updated_at;
      if (!raw) return 0;
      if (typeof raw === 'number') return raw;
      const s = String(raw).trim();
      if (!s) return 0;
      const parsed = new Date(s).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
      if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s)) {
        const parts = s.split(/[-/]/);
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d.getTime();
      }
      return 0;
    };

    const timeB = parseRegistrationTimestamp(b);
    const timeA = parseRegistrationTimestamp(a);
    if (timeA !== timeB && timeA > 0 && timeB > 0) {
      return sortOrder === 'oldest' ? timeA - timeB : timeB - timeA;
    }
    if (timeB > 0 && timeA === 0) return sortOrder === 'oldest' ? -1 : 1;
    if (timeA > 0 && timeB === 0) return sortOrder === 'oldest' ? 1 : -1;

    const idA = (a.lead_id || '').trim();
    const idB = (b.lead_id || '').trim();
    const numA = parseInt(idA.replace(/\D/g, ''), 10);
    const numB = parseInt(idB.replace(/\D/g, ''), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return sortOrder === 'oldest' ? numA - numB : numB - numA;
    }
    const comp = idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'oldest' ? comp : -comp;
  });

    return {
    PACKAGES_LIST,
    activeMasterDeliverables,
    activeMasterRoles,
    activeQuoteNum,
    activeTab,
    addLead,
    addNotification,
    addPackage,
    addQuotation,
    advanceReceived,
    appendCompletedStep,
    appliedEndDate,
    appliedStartDate,
    areReportingDetailsComplete,
    autoScrollToFormHeader,
    buildDateTime,
    canEdit,
    catSearchQuery,
    categoriesList,
    categoryFilter,
    collapsedEventIds,
    completeApprovedUnlockRequest,
    confirmBookingModalRef,
    confirmForm,
    confirmOrder,
    handleConfirmOrderAction,
    confirmedEventDate,
    confirmedEventTime,
    convertTo12Hour,
    convertTo24Hour,
    createEvents,
    createForm,
    createdLeadId,
    showDuplicateWarning,
    setShowDuplicateWarning,
    duplicateCustomerInfo,
    setDuplicateCustomerInfo,
    handleDuplicateContinue,
    handleDuplicateCancel,
    crmEvents,
    crmHighestStep,
    crmToast,
    crmWizardStep,
    currentRole,
    currentUser,
    customCategory,
    customerSearchQuery,
    dateRangeEnd,
    dateRangeStart,
    dbCategoryError,
    deleteLead,
    deleteOrder,
    deletePackage,
    deletePackageError,
    deletingPackageId,
    detectedCustomer,
    discountVal,
    dropdownCoords,
    dynamicAdditionalSum,
    dynamicBaseSum,
    dynamicFinalAmt,
    editableDeliverables,
    editableInclusions,
    editingEventId,
    editingPackage,
    editingServiceId,
    errorDetails,
    eventForm,
    eventsReporting,
    filterDate,
    filterEventDateOption,
    setFilterEventDateOption,
    filterQuery,
    filterSalesPerson,
    filterSource,
    filterStatus,
    filteredLeads,
    finalPackageAmount,
    finalReportingForm,
    finalTotal,
    followUpDate,
    followUpForm,
    formatDDMMYYYY,
    generatedPDFBlobUrl,
    getCleanSalesStaffMobile,
    getCleanSalesStaffName,
    getEffectiveSalesStaffMobile,
    getEffectiveSalesStaffName,
    getEventDateTimeErrorMessage,
    getFollowUpDate,
    getLeadCurrentStage,
    getLeadCurrentStatus,
    getLeadInfoForQuote,
    getLostReasonAndNotes,
    getRemarksPayload,
    getSelectedPkgsInfo,
    getStrictLostReasonAndNotes,
    handleAddDeliverable,
    handleAddInclusion,
    handleAddInlineService,
    handleAddNewEventClick,
    handleCancelLead,
    handleCheckExistingCustomer,
    handleConfirmOrderSubmit,
    handleDeleteEvent,
    handleDownloadCSV,
    handleDownloadExcel,
    handleDownloadQuotePDF,
    handleEditDeliverable,
    handleEditEvent,
    handleEditInclusion,
    handleEditServiceItem,
    handleExecuteQuickReorder,
    handleFinalReportingSubmit,
    handleFollowUpSubmit,
    handleGenerateQuote,
    handleOrderConfirmedSubmit,
    handlePackageDropdownChange,
    handlePreviewQuotePDF,
    handlePrintReport,
    handleRemoveDeliverable,
    handleRemoveInclusion,
    handleRemoveServiceItem,
    handleSaveEventForm,
    handleSaveLostLead,
    handleSavePackageOnly,
    handleSaveStep,
    handleSaveStep2Direct,
    handleSaveStep2FollowUp,
    handleSaveStep3FollowUp,
    handleSelectLead,
    handleSendEmailQuote,
    handleSendWhatsAppQuote,
    handleStatusSave,
    handleSubmitUnlockRequest,
    handleWizardNext,
    initEventsReporting,
    internalNotes,
    internalTab,
    isAddFormOpen,
    isAddingInline,
    isApprovedUnlocked,
    isComparingPkgs,
    isCrmLocked,
    isMultiEventLead,
    checkIsEventEnded,
    checkIsLeadCrmLocked,
    isCustomerInfoExpanded,
    isDeletingPackage,
    isDepartmentAllowedToEdit,
    isDownloadReportsExpanded,
    isEventDateTimeInvalid,
    isFiltersExpanded,
    isFirstRender,
    isLeadConfirmed,
    isLeadLocked,
    isLeadLost,
    isPkgDropdownOpen,
    isQuickReorderView,
    isRecordLocked,
    isSaving,
    isStep1Locked,
    isStep2Locked,
    isStep3Locked,
    isTimeEarlier,
    lastLoadedLeadIdRef,
    leadDiscount,
    leadPackages,
    leads,
    loadActiveMasterItems,
    lockRecord,
    logStatusUpdateError,
    logoAspectRatio,
    logoBase64,
    lostNotes,
    lostReason,
    newServiceName,
    newServicePrice,
    newServiceQty,
    normalizeDateStr,
    noteModalCustomerName,
    noteModalLeadId,
    noteModalOpen,
    noteModalOrderId,
    openDropdownLeadId,
    openReportingDetailsModal,
    orders,
    otherLostReason,
    otherSource,
    packageSuccessMsg,
    packages,
    parseDateParts,
    parseStatusUpdateError,
    parseTimeParts,
    payments,
    pkgDeliverableInput,
    pkgDeliverables,
    pkgDeliverablesList,
    pkgForm,
    pkgNotes,
    pkgPrices,
    pkgSearchQuery,
    pkgTeamMembers,
    production,
    quotationTerms,
    quotations,
    quoteAdditional,
    quoteDiscount,
    quoteServices,
    rawDynamicFinalAmt,
    renderEventDetailsSection,
    renderQuotationAndStep4Section,
    renderStep3Workspace,
    reorderForm,
    reportingTime,
    resetForm,
    salesStaffMobile,
    salesStaffName,
    salesStatus,
    saveErrorPopup,
    saveLeadPackages,
    saveStep3DataRealtime,
    selectedCustomerProfileId,
    selectedLead,
    selectedPkgIds,
    selectedPkgs,
    selectedUnlockLead,
    setActiveMasterDeliverables,
    setActiveMasterRoles,
    setActiveQuoteNum,
    setActiveTab,
    setAdvanceReceived,
    setAppliedEndDate,
    setAppliedStartDate,
    setCatSearchQuery,
    setCategoryFilter,
    setCollapsedEventIds,
    setConfirmForm,
    setConfirmedEventDate,
    setConfirmedEventTime,
    setCreateEvents,
    setCreateForm,
    setCreatedLeadId,
    setCrmEvents,
    setCrmHighestStep,
    setCrmToast,
    setCrmWizardStep,
    setCustomCategory,
    setCustomerSearchQuery,
    setDateRangeEnd,
    setDateRangeStart,
    setDbCategoryError,
    setDeletePackageError,
    setDeletingPackageId,
    setDetectedCustomer,
    setDropdownCoords,
    setEditableDeliverables,
    setEditableInclusions,
    setEditingEventId,
    setEditingPackage,
    setEditingServiceId,
    setErrorDetails,
    setEventForm,
    setEventsReporting,
    setFilterDate,
    setFilterQuery,
    setFilterSalesPerson,
    setFilterSource,
    setFilterStatus,
    setFinalPackageAmount,
    setFinalReportingForm,
    setFollowUpDate,
    setFollowUpForm,
    setGeneratedPDFBlobUrl,
    setInternalNotes,
    setInternalTab,
    setIsAddFormOpen,
    setIsAddingInline,
    setIsComparingPkgs,
    setIsCustomerInfoExpanded,
    setIsDeletingPackage,
    setIsDownloadReportsExpanded,
    setIsFiltersExpanded,
    setIsPkgDropdownOpen,
    setIsQuickReorderView,
    setIsSaving,
    setLeadDiscount,
    setLogoAspectRatio,
    setLogoBase64,
    setLostNotes,
    setLostReason,
    setNewServiceName,
    setNewServicePrice,
    setNewServiceQty,
    setNoteModalCustomerName,
    setNoteModalLeadId,
    setNoteModalOpen,
    setNoteModalOrderId,
    setOpenDropdownLeadId,
    setOtherLostReason,
    setOtherSource,
    setPackageSuccessMsg,
    setPkgDeliverableInput,
    setPkgDeliverables,
    setPkgDeliverablesList,
    setPkgForm,
    setPkgNotes,
    setPkgPrices,
    setPkgSearchQuery,
    setPkgTeamMembers,
    setQuotationTerms,
    setQuoteAdditional,
    setQuoteDiscount,
    setQuoteServices,
    setReorderForm,
    setReportingTime,
    setSalesStaffMobile,
    setSalesStaffName,
    setSalesStatus,
    setSaveErrorPopup,
    setSelectedCustomerProfileId,
    setSelectedLead,
    setSelectedPkgIds,
    setSelectedUnlockLead,
    setShowCancelConfirmPopup,
    setShowConfirmModal,
    setShowDetectionPopup,
    setShowEventForm,
    setShowFinalReportingModal,
    setShowLostModal,
    setShowStep2Popup,
    setShowStep3Popup,
    setShowUnlockRequestModal,
    setSortOrder,
    setStatusError,
    setStatusFilter,
    setStep2FollowUpDate,
    setStep2FollowUpNotes,
    setStep3AutoSaveStatus,
    setStep3FollowUpDate,
    setStep3FollowUpNotes,
    setStep3FollowUpTime,
    setStep3Option,
    setUnlockCustomReason,
    setUnlockReason,
    setUnlockRequestCustomReason,
    setUnlockRequestReason,
    setUnlockRequests,
    setUnlockingRecordId,
    setViewingPkgDetails,
    setWizardLeadData,
    setWizardStep,
    showCancelConfirmPopup,
    showConfirmModal,
    showDetectionPopup,
    showErrorHelper,
    showEventForm,
    showFinalReportingModal,
    showLostModal,
    showStep2Popup,
    showStep3Popup,
    showToastMsg,
    showUnlockRequestModal,
    showValidationError,
    sortOrder,
    statConfirmedOrders,
    statCreatedQuotation,
    statLeadLost,
    statQuoteFollowups,
    statQuotesSent,
    statusError,
    statusFilter,
    statusHistory,
    step2FollowUpDate,
    step2FollowUpNotes,
    step3AutoSaveStatus,
    step3FollowUpDate,
    step3FollowUpNotes,
    step3FollowUpTime,
    step3Option,
    step3SaveTimeoutRef,
    subtotal,
    todayStr,
    unlockCustomReason,
    unlockReason,
    unlockRecord,
    unlockRequestCustomReason,
    unlockRequestReason,
    unlockRequests,
    unlockedRecords,
    unlockingRecordId,
    updateLead,
    updateLeadFollowUp,
    updatePackage,
    updateQuotation,
    useSalesDashboardState,
    users,
    validateLeadForQuotation,
    validateStep3Data,
    viewingPkgDetails,
    wizardLeadData,
    wizardStep,
    LEAD_SOURCES,
    EVENT_TYPES: synchronizedEventTypes,
    synchronizedEventTypes,
    SHOOT_TYPES,
    PACKAGE_CATEGORIES,
    ACTIVE_STAGE_GROUPS
  };
};
