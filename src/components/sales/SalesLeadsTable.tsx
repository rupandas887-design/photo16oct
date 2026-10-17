import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Plus, Edit, CheckSquare, Search, Filter, Ban, X, Phone, Mail, MapPin, Calendar, DollarSign, Clock, Users, ArrowRight, ChevronDown, ChevronUp, Check, Package, Trash, Trash2, Eye, Loader2, CheckCircle2, RefreshCw, AlertCircle, MessageSquare, ArrowUpDown
} from 'lucide-react';
import { Lead, CurrentStage, LeadPackage, EVENT_TYPES, PACKAGE_CATEGORIES, ACTIVE_STAGE_GROUPS, LeadEvent } from '../../types';
import { StatusText } from '../ui/StatusText';
import { EventDropdownCell } from '../EventDropdownCell';
import { UnifiedEventDropdownCell } from '../UnifiedEventDropdownCell';
import { EventCategoryCell, getEventCategoryDateTimeTimestamp } from '../EventCategoryCell';
import { EventLocationCell } from '../EventLocationCell';
import { EventDateCell } from '../EventDateCell';
import { EventTimeCell } from '../EventTimeCell';
import { EventCell } from '../EventCell';
import { MultiSelectDropdown } from '../ui/MultiSelectDropdown';
import { CameraLensStatsCard, CameraLensTheme } from '../CameraLensStatsCard';
import { ListSortFilter, SortOrder } from '../ui/ListSortFilter';
import { formatINR, formatIndianPhoneNumber, validateIndianMobile, formatTime12Hour, getCustomers, triggerAutoScrollAndFocus, normalizeCategory, parseTeamMembers, formatQtyItem, formatQtyArray, formatQtyList, formatDateDDMMYY, deserializeLeadEvents, formatDateToDDMMYYYY } from '../../utils';
import { DateFilterInput } from '../ui/DateFilterInput';
import { SalesCalendar } from '../SalesCalendar';
import { CustomPackageMaster } from '../CustomPackageMaster';
import { AddressAutocomplete } from '../AddressAutocomplete';
import { jsPDF } from 'jspdf';
import { SHOOT_TYPES, LocalEditableInput, parseQtyAndText, combineQtyAndText, formatListToStructuredObjects, buildStep3EventPayloads, parseTeamMembersJsonToRecord, parseDeliverablesJsonToRecord, CompactQtyItemRowProps, CompactQtyItemRow, validateAndFormatTime, getLogoBase64FromUrl, generateQuotationPdfFileName, generateQuotationPDF, highlightText, LEAD_SOURCES, SalesModuleProps, checkIsLeadCrmLocked, getStep3FinalQuotationAmount } from '../SalesUtils';
import { AddNoteModal } from '../AddNoteModal';

export interface SalesLeadsTableProps {
  [key: string]: any;
}

export const SalesLeadsTable: React.FC<SalesLeadsTableProps> = (props) => {
  const {
    leads,
    filteredLeads,
    orders,
    payments,
    packages,
    currentRole,
    currentUser,
    canEdit,
    filterQuery,
    setFilterQuery,
    sortOrder,
    setSortOrder,
    isDownloadReportsExpanded,
    setIsDownloadReportsExpanded,
    isFiltersExpanded,
    setIsFiltersExpanded,
    filterSource,
    setFilterSource,
    filterStatus,
    setFilterStatus,
    filterSalesPerson,
    setFilterSalesPerson,
    filterDate,
    setFilterDate,
    filterEventDateOption,
    setFilterEventDateOption,
    dateRangeStart,
    setDateRangeStart,
    dateRangeEnd,
    setDateRangeEnd,
    appliedStartDate,
    setAppliedStartDate,
    appliedEndDate,
    setAppliedEndDate,
    handleDownloadCSV,
    handleDownloadExcel,
    handlePrintReport,
    resetFilters,
    getLeadCurrentStatus,
    getLeadCurrentStage,
    getStatusRank,
    isFollowUpDateTimeReached,
    unlockRequests,
    openDropdownLeadId,
    setOpenDropdownLeadId,
    dropdownCoords: externalDropdownCoords,
    setDropdownCoords: externalSetDropdownCoords,
    setNoteModalOpen,
    setNoteModalLeadId,
    setNoteModalOrderId,
    setNoteModalCustomerName,
    handleSelectLead,
    setSelectedLead,
    selectedLead,
    confirmForm,
    setConfirmForm,
    handleConfirmOrderAction,
    initEventsReporting,
    setShowConfirmModal,
    setSelectedUnlockLead,
    setUnlockRequestReason,
    setUnlockRequestCustomReason,
    setShowUnlockRequestModal,
    setLostReason,
    setOtherLostReason,
    setLostNotes,
    setShowLostModal,
    wizardLeadData,
    statCreatedQuotation,
    statQuotesSent,
    statQuoteFollowups,
    statConfirmedOrders,
    statLeadLost,
    statLostLeads,
    activeStageTab,
    setActiveStageTab,
    activeTab,
    setActiveTab,
    categoriesList,
    users,
    leadPackages = props.leadPackages,
    dynamicFinalAmt = props.dynamicFinalAmt,
    quotations = props.quotations
  } = props;

  const leadSourcesList = props.LEAD_SOURCES || LEAD_SOURCES || [];
  const safeFilteredLeads = Array.isArray(filteredLeads) ? filteredLeads : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safePackages = Array.isArray(packages) ? packages : [];

  const [sortColumn, setSortColumn] = useState<'created_date' | 'lead_id' | 'order_id' | 'event_date' | null>('created_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Sync toolbar sortOrder if changed from outside
  useEffect(() => {
    if (sortOrder === 'latest') {
      setSortDirection('desc');
    } else if (sortOrder === 'oldest') {
      setSortDirection('asc');
    }
  }, [sortOrder]);

  const handleColumnSort = (column: 'created_date' | 'lead_id' | 'order_id' | 'event_date') => {
    if (column === 'created_date') {
      if (sortColumn !== 'created_date') {
        // 1st CLICK: Most Recent (Descending: Newest -> Oldest)
        setSortColumn('created_date');
        setSortDirection('desc');
        if (setSortOrder) setSortOrder('latest');
      } else if (sortDirection === 'desc') {
        // 2nd CLICK: Last (Ascending: Oldest -> Newest)
        setSortColumn('created_date');
        setSortDirection('asc');
        if (setSortOrder) setSortOrder('oldest');
      } else {
        // 3rd CLICK: All / Reset (Reset sorting and return to default Most Recent Created Lead First)
        setSortColumn('created_date');
        setSortDirection('desc');
        if (setSortOrder) setSortOrder('latest');
      }
      return;
    }

    if (column === 'event_date') {
      if (sortColumn !== 'event_date') {
        // 1st CLICK: Most Recent Event First (desc)
        setSortColumn('event_date');
        setSortDirection('desc');
        if (setSortOrder) setSortOrder('latest');
      } else if (sortDirection === 'desc') {
        // 2nd CLICK: Earliest / Oldest Event First (asc)
        setSortColumn('event_date');
        setSortDirection('asc');
        if (setSortOrder) setSortOrder('oldest');
      } else {
        // 3rd CLICK: Reset to default Most Recent Created Lead First (desc)
        setSortColumn('created_date');
        setSortDirection('desc');
        if (setSortOrder) setSortOrder('latest');
      }
      return;
    }

    if (sortColumn === column) {
      const nextDir = sortDirection === 'desc' ? 'asc' : 'desc';
      setSortDirection(nextDir);
      if (setSortOrder) {
        setSortOrder(nextDir === 'desc' ? 'latest' : 'oldest');
      }
    } else {
      setSortColumn(column);
      const initialDir = 'desc';
      setSortDirection(initialDir);
      if (setSortOrder) {
        setSortOrder(initialDir === 'desc' ? 'latest' : 'oldest');
      }
    }
  };

  const getLeadOrderId = (leadObj: Lead): string => {
    let cachedOrderId: string | undefined = undefined;
    try {
      cachedOrderId = localStorage.getItem(`lead_order_${leadObj.lead_id}`) || undefined;
    } catch (e) {}

    const linkedOrder = safeOrders.find((o) => 
      o.lead_id === leadObj.lead_id || 
      o.order_id === leadObj.lead_id || 
      (leadObj.order_id && (o.order_id === leadObj.order_id || o.lead_id === leadObj.order_id)) ||
      ((leadObj as any).orders && (o.order_id === (leadObj as any).orders || o.lead_id === (leadObj as any).orders))
    );
    return (linkedOrder?.order_id || leadObj.order_id || (leadObj as any).orders || cachedOrderId || '').trim();
  };

  const getLeadCreatedTimestamp = (leadObj: Lead): number => {
    // Sourced strictly from actual saved creation timestamp or date
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

  const compareAlphanumeric = (valA: string, valB: string): number => {
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
  };

  const getLeadEventTimestamp = (leadObj: Lead): number => {
    const linkedOrder = safeOrders.find((o: any) => 
      o.lead_id === leadObj.lead_id || 
      o.order_id === leadObj.lead_id || 
      (leadObj.order_id && (o.order_id === leadObj.order_id || o.lead_id === leadObj.order_id)) ||
      ((leadObj as any).orders && (o.order_id === (leadObj as any).orders || o.lead_id === (leadObj as any).orders))
    );

    let rawEventsList: any[] = [];
    if (leadObj?.events && Array.isArray(leadObj.events) && leadObj.events.length > 0) {
      rawEventsList = leadObj.events;
    } else if (linkedOrder?.events && Array.isArray(linkedOrder.events) && linkedOrder.events.length > 0) {
      rawEventsList = linkedOrder.events;
    } else if (typeof leadObj?.events === 'string') {
      try {
        const parsed = JSON.parse(leadObj.events);
        if (Array.isArray(parsed)) rawEventsList = parsed;
      } catch (e) {}
    } else if (typeof linkedOrder?.events === 'string') {
      try {
        const parsed = JSON.parse(linkedOrder.events);
        if (Array.isArray(parsed)) rawEventsList = parsed;
      } catch (e) {}
    }

    if (rawEventsList.length === 0 && leadObj?.notes_special_customizations) {
      rawEventsList = deserializeLeadEvents(leadObj.notes_special_customizations).events;
    }
    if (rawEventsList.length === 0 && (linkedOrder as any)?.notes_special_customizations) {
      rawEventsList = deserializeLeadEvents((linkedOrder as any).notes_special_customizations).events;
    }

    const timestamps: number[] = [];
    if (rawEventsList.length > 0) {
      rawEventsList.forEach((ev: any) => {
        const dStr = ev.event_date || ev.Event_Date || ev.date || leadObj.event_date || linkedOrder?.event_date || '';
        const tStr = ev.event_start_time || ev.event_time || ev.Event_Start_Time || ev.time || leadObj.event_time || linkedOrder?.event_time || '';
        const ts = getEventCategoryDateTimeTimestamp(dStr, tStr);
        if (ts > 0) timestamps.push(ts);
      });
    }

    if (timestamps.length === 0) {
      const singleDate = leadObj.event_date || linkedOrder?.event_date || '';
      const singleTime = leadObj.event_time || linkedOrder?.event_time || '';
      const ts = getEventCategoryDateTimeTimestamp(singleDate, singleTime);
      if (ts > 0) timestamps.push(ts);
    }

    if (timestamps.length === 0) return 0;

    timestamps.sort((a, b) => b - a);
    if (filterEventDateOption === 'last_event' && timestamps.length >= 2) {
      return timestamps[1];
    }
    return timestamps[0];
  };

  const displayedLeads = React.useMemo(() => {
    // By default (or when sortColumn is null or created_date): Always show the MOST RECENTLY CREATED LEAD at the TOP (descending order)
    if (!sortColumn || sortColumn === 'created_date') {
      return [...safeFilteredLeads].sort((a, b) => {
        const timeA = getLeadCreatedTimestamp(a);
        const timeB = getLeadCreatedTimestamp(b);
        if (timeA !== timeB && timeA > 0 && timeB > 0) {
          return (sortColumn === 'created_date' && sortDirection === 'asc') ? timeA - timeB : timeB - timeA;
        }
        if (timeA > 0 && timeB === 0) return (sortColumn === 'created_date' && sortDirection === 'asc') ? 1 : -1;
        if (timeB > 0 && timeA === 0) return (sortColumn === 'created_date' && sortDirection === 'asc') ? -1 : 1;

        // Tie-breaker: Numeric sequence from lead_id (newest lead ID first) or alphanumeric
        const idA = (a.lead_id || '').trim();
        const idB = (b.lead_id || '').trim();
        const numA = parseInt(idA.replace(/\D/g, ''), 10);
        const numB = parseInt(idB.replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return (sortColumn === 'created_date' && sortDirection === 'asc') ? numA - numB : numB - numA;
        }
        const comp = compareAlphanumeric(idA, idB);
        return (sortColumn === 'created_date' && sortDirection === 'asc') ? comp : -comp;
      });
    }

    return [...safeFilteredLeads].sort((a, b) => {
      // 1. If sorting by Lead ID
      if (sortColumn === 'lead_id') {
        const idA = (a.lead_id || '').trim();
        const idB = (b.lead_id || '').trim();
        if (idA && idB) {
          const numA = parseInt(idA.replace(/\D/g, ''), 10);
          const numB = parseInt(idB.replace(/\D/g, ''), 10);
          if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
            return sortDirection === 'desc' ? numB - numA : numA - numB;
          }
          const comp = compareAlphanumeric(idA, idB);
          if (comp !== 0) {
            return sortDirection === 'desc' ? -comp : comp;
          }
        } else if (idA) {
          return sortDirection === 'desc' ? -1 : 1;
        } else if (idB) {
          return sortDirection === 'desc' ? 1 : -1;
        }
      }

      // 2. If sorting by Order ID
      if (sortColumn === 'order_id') {
        const ordA = getLeadOrderId(a);
        const ordB = getLeadOrderId(b);
        if (ordA && ordB) {
          const comp = compareAlphanumeric(ordA, ordB);
          if (comp !== 0) {
            return sortDirection === 'desc' ? -comp : comp;
          }
        } else if (ordA) {
          return -1;
        } else if (ordB) {
          return 1;
        }
      }

      // 3. If sorting by Event Category / Event Date
      if (sortColumn === 'event_date') {
        const tsA = getLeadEventTimestamp(a);
        const tsB = getLeadEventTimestamp(b);
        if (tsA > 0 && tsB > 0) {
          if (tsA !== tsB) {
            return sortDirection === 'asc' ? tsA - tsB : tsB - tsA;
          }
        } else if (tsA > 0) {
          return sortDirection === 'asc' ? 1 : -1;
        } else if (tsB > 0) {
          return sortDirection === 'asc' ? -1 : 1;
        }
      }

      // Default fallback: Most recently created lead first (descending)
      const timeA = getLeadCreatedTimestamp(a);
      const timeB = getLeadCreatedTimestamp(b);
      if (timeA !== timeB && timeA > 0 && timeB > 0) {
        return timeB - timeA;
      }
      if (timeB > 0 && timeA === 0) return 1;
      if (timeA > 0 && timeB === 0) return -1;

      const idA = (a.lead_id || '').trim();
      const idB = (b.lead_id || '').trim();
      const numA = parseInt(idA.replace(/\D/g, ''), 10);
      const numB = parseInt(idB.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
        return numB - numA;
      }
      return compareAlphanumeric(idB, idA);
    });
  }, [safeFilteredLeads, sortColumn, sortDirection, safeOrders, filterEventDateOption]);

  const getMostRecentEventDisplay = (leadObj: Lead, ordersList?: any[]): string => {
    const linkedOrder = ordersList?.find((o: any) => 
      o.lead_id === leadObj.lead_id || 
      o.order_id === leadObj.lead_id || 
      (leadObj.order_id && (o.order_id === leadObj.order_id || o.lead_id === leadObj.order_id)) ||
      ((leadObj as any).orders && (o.order_id === (leadObj as any).orders || o.lead_id === (leadObj as any).orders))
    );

    const rawEventsList = (leadObj?.events && Array.isArray(leadObj.events) && leadObj.events.length > 0)
      ? leadObj.events
      : (linkedOrder?.events && Array.isArray(linkedOrder.events) && linkedOrder.events.length > 0)
        ? linkedOrder.events
        : [];

    if (rawEventsList.length > 0) {
      const parsedEvents = rawEventsList.map((ev: any, idx: number) => {
        const name = (
          ev.event_name || 
          ev.custom_event_name || 
          ev.event_type || 
          ev.Event_Name || 
          leadObj.custom_event_name || 
          leadObj.event_name || 
          leadObj.event_type || 
          `Event ${idx + 1}`
        ).trim();

        const dateStr = (ev.event_date || ev.Event_Date || ev.date || '').trim();
        let timestamp = 0;
        if (dateStr) {
          if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(dateStr)) {
            const parts = dateStr.split(/[-/]/);
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            const d = new Date(year, month, day);
            if (!isNaN(d.getTime())) timestamp = d.getTime();
          } else {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
              timestamp = d.getTime();
            }
          }
        }

        return {
          id: ev.id || ev.event_id || `evt-${idx}`,
          name: name || 'Event',
          dateStr,
          timestamp
        };
      });

      // Sort by MOST RECENT event date FIRST (descending timestamp: furthest/latest event date first)
      parsedEvents.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return b.timestamp - a.timestamp;
        }
        if (a.timestamp) return -1;
        if (b.timestamp) return 1;
        return 0;
      });

      const mostRecentEvent = parsedEvents[0];
      const mostRecentName = mostRecentEvent?.name || 'Event';
      const totalCount = parsedEvents.length;

      if (totalCount > 1) {
        return `${mostRecentName} +${totalCount - 1}`;
      }
      return mostRecentName;
    }

    // Single fallback event on lead/order
    const singleName = (
      leadObj.custom_event_name || 
      leadObj.event_name || 
      leadObj.event_type || 
      linkedOrder?.custom_event_name || 
      linkedOrder?.event_name || 
      linkedOrder?.event_type || 
      'Event'
    ).trim();

    return singleName || 'Event';
  };

  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const updateDropdownPos = React.useCallback((leadId: string) => {
    const btn = document.getElementById(`btn_actions_confirm_${leadId}`);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 192; // 12rem / w-48
    const menuHeight = 175; // approx height

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      top = rect.top - menuHeight - 6;
      if (top < 8) top = 8;
    } else {
      top = rect.bottom + 6;
      if (top + menuHeight > viewportHeight - 8) {
        top = viewportHeight - menuHeight - 8;
      }
    }

    let left = rect.right - menuWidth;
    if (left + menuWidth > viewportWidth - 12) {
      left = viewportWidth - menuWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    setDropdownStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${menuWidth}px`,
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (!openDropdownLeadId) return;

    updateDropdownPos(openDropdownLeadId);

    const handleScroll = () => {
      updateDropdownPos(openDropdownLeadId);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.actions-dropdown-menu') && !target.closest('.actions-dropdown-btn')) {
        setOpenDropdownLeadId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [openDropdownLeadId, updateDropdownPos, setOpenDropdownLeadId]);

  return (
        <div className="space-y-4">

          {/* Sales Performance Dashboard Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-2">
            {[
              { label: 'Create Quote', val: statCreatedQuotation, theme: 'blue' as CameraLensTheme, filterValue: 'Create Quote', chartPoints: [10, 15, 12, 18, 14, 20, 16], trendText: 'Initial Lead' },
              { label: 'Quote Sent', val: statQuotesSent, theme: 'purple' as CameraLensTheme, filterValue: 'Quote Sent', chartPoints: [12, 14, 18, 15, 21, 25, 22], trendText: 'Quotation Saved' },
              { label: 'Quote Follow-up', val: statQuoteFollowups, theme: 'gold' as CameraLensTheme, filterValue: 'Quote Follow-up', chartPoints: [5, 12, 8, 15, 10, 19, 14], trendText: 'Scheduled CRM' },
              { label: 'Confirm Order', val: statConfirmedOrders, theme: 'cyan' as CameraLensTheme, filterValue: 'Confirm Order', chartPoints: [8, 15, 12, 20, 16, 25, 24], trendText: 'To Operations' },
              { label: 'Lead Lost', val: statLeadLost, theme: 'red' as CameraLensTheme, filterValue: 'Lead Lost', chartPoints: [4, 6, 3, 7, 5, 8, 4], trendText: 'Opportunity Closed' },
            ].map((card, idx) => (
              <CameraLensStatsCard
                key={idx}
                label={card.label}
                val={card.val}
                theme={card.theme}
                trendText={card.trendText}
                subText="SALES STATUS"
                chartPoints={card.chartPoints}
                activeFilterValue={filterStatus}
                currentFilterValue={card.filterValue}
                onClick={() => setFilterStatus(filterStatus === card.filterValue ? '' : card.filterValue)}
                lensLabel={card.label.slice(0, 10).toUpperCase()}
              />
            ))}
          </div>
          
          {/* Leads Directory Header Bar & Collapsible Utilities */}
          {(() => {
            const activeFilterCount = [
              Boolean(filterQuery.trim()),
              Boolean(filterSource),
              Boolean(filterStatus),
              Boolean(filterEventDateOption && filterEventDateOption !== 'all'),
              Boolean(dateRangeStart || appliedStartDate),
              Boolean(dateRangeEnd || appliedEndDate)
            ].filter(Boolean).length;

            return (
              <div className="space-y-3">
                {/* Leads Directory Title & Control Buttons Bar */}
                <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-850 shadow-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📁</span>
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">Leads Directory</h3>
                        <p className="text-[10px] text-zinc-400">Export active pipeline registers using start and end filters</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                      {/* Sort Order Filter Button */}
                      <ListSortFilter value={sortOrder} onChange={setSortOrder} />

                      {/* Event Date Filter selector (Most Recent Event / Last Event / All) */}
                      <div className="relative">
                        <select
                          id="select_event_date_filter_toolbar"
                          value={filterEventDateOption || 'all'}
                          onChange={(e) => {
                            const val = e.target.value as 'all' | 'most_recent' | 'last_event' | '';
                            if (setFilterEventDateOption) {
                              setFilterEventDateOption(val === 'all' ? '' : val);
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-sm appearance-none pr-8 ${
                            filterEventDateOption && filterEventDateOption !== 'all'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                              : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                          }`}
                          title="Event Date Filter: Most Recent Event, Last Event, All"
                        >
                          <option value="most_recent" className="bg-zinc-950 text-amber-300">Most Recent Event</option>
                          <option value="last_event" className="bg-zinc-950 text-amber-300">Last Event</option>
                          <option value="all" className="bg-zinc-950 text-zinc-300">All</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>

                      {/* Download Reports Button */}
                      <button
                        type="button"
                        id="btn_toggle_download_reports"
                        onClick={() => setIsDownloadReportsExpanded(!isDownloadReportsExpanded)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-sm ${
                          isDownloadReportsExpanded
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                            : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <span>📥</span>
                        <span>Download Reports</span>
                        {isDownloadReportsExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-amber-400 ml-0.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-0.5 shrink-0" />
                        )}
                      </button>

                      {/* Filters Toggle Button */}
                      <button
                        type="button"
                        id="btn_toggle_filters"
                        onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer shadow-sm ${
                          isFiltersExpanded || activeFilterCount > 0
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10'
                            : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                          <span className="bg-emerald-500 text-zinc-950 text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
                            {activeFilterCount}
                          </span>
                        )}
                        {isFiltersExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-emerald-400 ml-0.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-0.5 shrink-0" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Download Reports Options Panel */}
                  <div 
                    className={`grid transition-all duration-300 ease-in-out ${
                      isDownloadReportsExpanded 
                        ? 'grid-rows-[1fr] opacity-100 pt-3 border-t border-zinc-800/60' 
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handlePrintReport}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-amber-400 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Print lead report to paper"
                        >
                          <span>🖨️</span> Print Report
                        </button>
                        
                        <button
                          type="button"
                          onClick={handlePrintReport}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-rose-400 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Download report as PDF format"
                        >
                          <span>📄</span> Download PDF
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleDownloadExcel}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-emerald-450 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Download report as Excel spreadsheet"
                        >
                          <span>📊</span> Excel (.xlsx)
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadCSV}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-zinc-950 hover:bg-zinc-900 text-indigo-400 border border-zinc-850 hover:border-zinc-800 rounded-lg transition-all cursor-pointer"
                          title="Download report as CSV file"
                        >
                          <span>📝</span> CSV
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Quick Filters Panel */}
                <div 
                  className={`grid transition-all duration-300 ease-in-out ${
                    isFiltersExpanded 
                      ? 'grid-rows-[1fr] opacity-100 my-3' 
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="bg-zinc-900/40 rounded-2xl border border-zinc-850 shadow-xl relative p-4">
                      {/* Corner calibration tick marks */}
                      <div className="absolute top-2 left-2 w-1.5 h-1.5 border-t border-l border-emerald-500/40" />
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 border-t border-r border-emerald-500/40" />
                      <div className="absolute bottom-2 left-2 w-1.5 h-1.5 border-b border-l border-emerald-500/40" />
                      <div className="absolute bottom-2 right-2 w-1.5 h-1.5 border-b border-r border-emerald-500/40" />

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        {/* Search query */}
                        <div className="md:col-span-3">
                          <label className="block text-[10px] uppercase font-mono font-bold text-zinc-400 mb-1">
                            Search Lead / Customer Name
                          </label>
                          <div className="relative">
                            <Search className="w-4 h-4 text-emerald-505 absolute left-3 top-3" />
                            <input
                              type="text"
                              placeholder="ID, name, or phone..."
                              value={filterQuery}
                              onChange={(e) => setFilterQuery(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-850 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                            />
                          </div>
                        </div>

                        {/* Source */}
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            Lead Source
                          </label>
                          <select
                            value={filterSource}
                            onChange={(e) => setFilterSource(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100/90"
                          >
                            <option value="">All Sources</option>
                            {(leadSourcesList || []).map(source => (
                              <option key={source} value={source}>{source}</option>
                            ))}
                          </select>
                        </div>

                        {/* Status (Stage) */}
                        <div className="md:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            Active Stage
                          </label>
                          <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100/90 font-sans cursor-pointer focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">All Stages</option>
                            {(ACTIVE_STAGE_GROUPS || []).map((group, idx) => (
                              <optgroup key={idx} label={group.label} className={`bg-slate-950 ${group.colorClass} font-bold`}>
                                {(group.options || []).map(opt => (
                                  <option key={opt.value} value={opt.value} className="text-white font-normal">{opt.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        {/* Start Date */}
                        <div className="md:col-span-1 sm:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            Start Date
                          </label>
                          <DateFilterInput
                            value={dateRangeStart}
                            onChange={setDateRangeStart}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono focus:border-amber-500"
                          />
                        </div>

                        {/* End Date */}
                        <div className="md:col-span-1 sm:col-span-2">
                          <label className="block text-[10px] uppercase font-mono font-bold text-slate-400 mb-1">
                            End Date
                          </label>
                          <DateFilterInput
                            value={dateRangeEnd}
                            onChange={setDateRangeEnd}
                            className="w-full bg-slate-900 border border-slate-750 rounded-lg py-1.5 px-3 text-xs text-slate-100 font-mono focus:border-amber-500"
                          />
                        </div>

                        {/* Actions */}
                        <div className="md:col-span-1 flex flex-col sm:flex-row md:flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedStartDate(dateRangeStart);
                              setAppliedEndDate(dateRangeEnd);
                            }}
                            className="w-full flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 py-1.5 text-[10px] font-bold text-white rounded transition-all cursor-pointer"
                            title="Apply Date Filter"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFilterQuery('');
                              setFilterSource('');
                              setFilterStatus('');
                              setFilterSalesPerson('');
                              setFilterDate('');
                              if (setFilterEventDateOption) setFilterEventDateOption('');
                              setDateRangeStart('');
                              setDateRangeEnd('');
                              setAppliedStartDate('');
                              setAppliedEndDate('');
                            }}
                            className="w-full flex items-center justify-center gap-0.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 py-1.5 px-1.5 text-[10px] text-zinc-300 rounded transition-all cursor-pointer animate-none"
                            title="Reset all filters"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Table view */}
          <div className="bg-zinc-900/20 rounded-2xl border border-zinc-850 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto min-h-[220px]">
              <table className="w-full text-left text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-zinc-950/70 text-zinc-405 font-bold border-b border-zinc-850 text-[10px] uppercase font-mono tracking-wider">
                    <th className="p-3.5 pl-5">
                      <button
                        type="button"
                        onClick={() => handleColumnSort('lead_id')}
                        className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 hover:text-white transition-colors cursor-pointer select-none group"
                        title="Sort by Lead ID (Newest / Oldest)"
                      >
                        <span>Lead ID</span>
                        <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'lead_id' ? 'text-sky-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                      </button>
                    </th>
                    <th className="p-3.5">
                      <button
                        type="button"
                        onClick={() => handleColumnSort('order_id')}
                        className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 hover:text-white transition-colors cursor-pointer select-none group"
                        title="Sort by Order ID (Highest / Lowest)"
                      >
                        <span>Order ID</span>
                        <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'order_id' ? 'text-sky-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                      </button>
                    </th>
                    <th className="p-3.5">Customer Name</th>
                    <th className="p-3.5">Mobile Number</th>
                    <th className="p-3.5">
                      <span className="uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 select-none">
                        Event Category
                      </span>
                    </th>
                    <th className="p-3.5">Event Location</th>
                    <th className="p-3.5">
                      <button
                        type="button"
                        onClick={() => handleColumnSort('event_date')}
                        className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 hover:text-white transition-colors cursor-pointer select-none group"
                        title="Sort by Event Date (Earliest / Latest)"
                      >
                        <span>Event Date</span>
                        <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'event_date' ? 'text-sky-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                      </button>
                    </th>
                    <th className="p-3.5">
                      <span className="uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 select-none">
                        Event Time
                      </span>
                    </th>
                    <th className="p-3.5">Current Status</th>
                    <th className="p-3.5">
                      <button
                        type="button"
                        onClick={() => handleColumnSort('created_date')}
                        className="inline-flex items-center gap-1.5 uppercase font-mono tracking-wider text-[10px] font-bold text-zinc-405 hover:text-white transition-colors cursor-pointer select-none group"
                        title={
                          sortColumn === 'created_date'
                            ? sortDirection === 'desc'
                              ? 'Created Date: Most Recent (1st Click) → Click for Last / Oldest'
                              : 'Created Date: Last / Oldest (2nd Click) → Click for All / Reset'
                            : 'Created Date: All / Default (3rd Click) → Click for Most Recent'
                        }
                      >
                        <span>Created Date</span>
                        <ArrowUpDown className={`w-3 h-3 transition-colors ${sortColumn === 'created_date' ? (sortDirection === 'desc' ? 'text-sky-400' : 'text-amber-400') : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                      </button>
                    </th>
                    <th className="p-3.5 text-right pr-5 w-[160px] min-w-max">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/60">
                  {displayedLeads.length > 0 ? (
                    displayedLeads.map((lead) => {
                      const leadStatus = getLeadCurrentStatus ? getLeadCurrentStatus(lead) : lead.status;
                      const currentStage = getLeadCurrentStage ? getLeadCurrentStage(lead) : 'Sales';
                      const isActiveInSales = currentStage === 'Sales';
                      let cachedOrderId: string | undefined = undefined;
                      try {
                        cachedOrderId = localStorage.getItem(`lead_order_${lead.lead_id}`) || undefined;
                      } catch (e) {}

                      const linkedOrder = safeOrders.find((o) => 
                        o.lead_id === lead.lead_id || 
                        o.order_id === lead.lead_id || 
                        (lead.order_id && (o.order_id === lead.order_id || o.lead_id === lead.order_id)) ||
                        ((lead as any).orders && (o.order_id === (lead as any).orders || o.lead_id === (lead as any).orders))
                      );
                      const displayOrderId = linkedOrder?.order_id || lead.order_id || (lead as any).orders || cachedOrderId || 'N/A';

                      return (
                        <tr 
                          key={lead.lead_id} 
                          className={`hover:bg-zinc-900/30 text-zinc-300 transition-all ${openDropdownLeadId === lead.lead_id ? 'relative z-30' : ''}`}
                        >
                          <td className="p-3.5 pl-5 font-mono text-[11px] font-bold text-indigo-400">
                            {lead.lead_id}
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-violet-400 font-bold">
                            {displayOrderId}
                          </td>
                          <td className="p-3.5 font-bold text-white">
                            {lead.customer_name === 'Inbound Prospect' ? '' : lead.customer_name}
                          </td>
                          <td className="p-3.5 font-mono text-zinc-400">
                            {formatIndianPhoneNumber(lead.mobile)}
                          </td>
                          <td className="p-3.5 text-zinc-300 font-sans">
                            <EventCategoryCell lead={lead} orders={safeOrders} filterEventDateOption={filterEventDateOption} />
                          </td>
                          <td className="p-3.5 text-zinc-300">
                            <EventLocationCell lead={lead} orders={safeOrders} filterEventDateOption={filterEventDateOption} />
                          </td>
                          <td className="p-3.5 text-zinc-300">
                            <EventDateCell lead={lead} orders={safeOrders} filterEventDateOption={filterEventDateOption} />
                          </td>
                          <td className="p-3.5 text-zinc-300">
                            <EventTimeCell lead={lead} orders={safeOrders} filterEventDateOption={filterEventDateOption} />
                          </td>

                          <td className="p-3.5">
                            <StatusText status={leadStatus} />
                          </td>
                          <td className="p-3.5 font-mono text-zinc-400">
                            {lead.created_date ? (formatDateDDMMYY(lead.created_date) || lead.created_date) : 'N/A'}
                          </td>
                          <td className="p-3.5 text-right pr-5 w-[160px] min-w-max overflow-visible relative">
                            {(() => {
                              const isManageCrmOnlyStatus = ['New Lead', 'Follow-up', 'Follow Up', 'Contacted', 'Create Quote', 'Created Quotation'].includes(leadStatus);
                              const isLeadLostStatus = ['Lead Lost', 'Lost Lead'].includes(leadStatus);
                              const isLeadConfirmedRecord = 
                                ['Confirm Order', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed', 'Order Close'].includes(leadStatus) ||
                                ['Confirm Order', 'Order Confirmed', 'Event Scheduled', 'Event Started', 'Event Completed', 'Closed', 'Order Close'].includes(lead.status || '') ||
                                (lead as any).current_status === 'Order Confirmed' ||
                                (lead as any).booking_status === 'Confirmed' ||
                                Boolean(linkedOrder && linkedOrder.status !== 'Cancelled') ||
                                (lead as any).is_confirmed === true;
                              const isActionsDropdownStatus = ['Quote Sent', 'Quotation Sent', 'Quote Follow-up', 'Negotiation', 'Confirm Order', 'Order Confirmed'].includes(leadStatus) || currentStage !== 'Sales';
                              
                              return (
                                  <div className="relative inline-block text-right actions-dropdown-container">
                                    <button
                                      type="button"
                                      id={`btn_actions_confirm_${lead.lead_id}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (openDropdownLeadId === lead.lead_id) {
                                          setOpenDropdownLeadId(null);
                                        } else {
                                          setOpenDropdownLeadId(lead.lead_id);
                                        }
                                      }}
                                      className="actions-dropdown-btn w-36 h-8 text-[11px] font-bold rounded-xl border transition-all cursor-pointer inline-flex items-center justify-between px-2.5 shadow shrink-0 bg-zinc-950 hover:bg-zinc-900 text-amber-400 hover:text-white border-zinc-850"
                                    >
                                      <span>⚡ Actions</span>
                                      <span className="text-[10px] ml-1">▼</span>
                                    </button>
                                    
                                    {openDropdownLeadId === lead.lead_id && createPortal(
                                      <div 
                                        className="fixed rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 space-y-1.5 text-left actions-dropdown-menu animate-in fade-in zoom-in-95 duration-100"
                                        style={dropdownStyle}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {/* ALWAYS SHOW ADD NOTE */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownLeadId(null);
                                            setNoteModalLeadId(lead.lead_id);
                                            setNoteModalOrderId(displayOrderId !== 'N/A' ? displayOrderId : '');
                                            setNoteModalCustomerName(lead.customer_name);
                                            setNoteModalOpen(true);
                                          }}
                                          className="w-full h-8 px-3 text-xs font-bold bg-blue-950/40 hover:bg-blue-900/60 text-blue-400 hover:text-white rounded-lg border border-blue-900/40 transition-all cursor-pointer flex items-center gap-2 shadow"
                                        >
                                          <FileText className="w-3.5 h-3.5 shrink-0" />
                                          <span>VIEW/ADD NOTE</span>
                                        </button>
                                        
                                        {/* VIEW / MANAGE CRM */}
                                        {(() => {
                                          const isCrmEnded = checkIsLeadCrmLocked(lead);
                                          return (
                                            <button
                                              type="button"
                                              id={`btn_followup_${lead.lead_id}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setOpenDropdownLeadId(null);
                                                handleSelectLead(lead);
                                              }}
                                              className={`w-full h-8 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow ${(!isLeadLostStatus && canEdit && !isCrmEnded) ? 'bg-sky-950/30 hover:bg-sky-900/50 text-sky-400 hover:text-white border border-sky-900/50' : 'bg-zinc-950 hover:bg-zinc-900 text-amber-400 hover:text-white border border-zinc-850/40'}`}
                                            >
                                              {(!isLeadLostStatus && canEdit && !isCrmEnded) ? <Edit className="w-3.5 h-3.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 shrink-0" />}
                                              <span>{isCrmEnded ? 'View CRM (Locked)' : (!isLeadLostStatus && canEdit ? 'Manage CRM' : 'View CRM')}</span>
                                            </button>
                                          );
                                        })()}
                                        
                                        {/* CONFIRM ORDER - only show before confirmation */}
                                        {!isLeadConfirmedRecord && isActionsDropdownStatus && leadStatus !== 'Order Close' && currentStage === 'Sales' && (
                                          <button
                                            type="button"
                                            id={`btn_confirm_order_direct_${lead.lead_id}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (handleConfirmOrderAction) {
                                                handleConfirmOrderAction(lead);
                                              } else {
                                                setOpenDropdownLeadId(null);
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
                                                const step3Amount = getStep3FinalQuotationAmount(lead, {
                                                  dynamicFinalAmt,
                                                  wizardLeadData,
                                                  quotations,
                                                  leads,
                                                  orders,
                                                  leadPackages
                                                });
                                                setConfirmForm({
                                                  ...confirmForm,
                                                  package_name: packages?.find((p: any) => String(p.package_id) === String(lead.Select_Package_Option))?.package_name || lead.Select_Package_Option || '',
                                                  quotation_amount: step3Amount || Number(lead.Final_Quotation_Amount) || Number((lead as any).final_quotation_amount) || 0,
                                                  advance_received: calcAdvance,
                                                  event_date: lead.event_date || today,
                                                  event_time: lead.event_time || ''
                                                });
                                                initEventsReporting(lead);
                                                setShowConfirmModal(true);
                                              }
                                            }}
                                            className="w-full h-8 px-3 text-xs font-bold bg-emerald-950 hover:bg-emerald-900 text-emerald-400 hover:text-white rounded-lg border border-emerald-900/30 transition-all cursor-pointer flex items-center gap-2 shadow"
                                          >
                                            <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                            <span>Confirm Order</span>
                                          </button>
                                        )}
                                        
                                        {/* LOST LEAD */}
                                        {!isLeadLostStatus && (
                                          <button
                                            type="button"
                                            id={`btn_lost_lead_direct_${lead.lead_id}`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOpenDropdownLeadId(null);
                                              setSelectedLead(lead);
                                              setLostReason('');
                                              setOtherLostReason('');
                                              setLostNotes('');
                                              setShowLostModal(true);
                                            }}
                                            className="w-full h-8 px-3 text-xs font-bold bg-rose-950 hover:bg-rose-900 text-rose-400 hover:text-white rounded-lg border border-rose-900/30 transition-all cursor-pointer flex items-center gap-2 shadow"
                                          >
                                            <X className="w-3.5 h-3.5 shrink-0" />
                                            <span>Lost Lead</span>
                                          </button>
                                        )}
                                      </div>,
                                      document.body
                                    )}
                                  </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} className="p-12 text-center text-slate-500">
                        <Filter className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
                        <span className="text-xs font-mono text-zinc-500">No matching records in the directory grid. Try resetting filters.</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
  );
};
