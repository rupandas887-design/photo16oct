import React, { useState, useEffect } from 'react';
import { useRole } from '../RoleContext';
import { 
  Search, Calendar, User, Clock, CheckCircle2, AlertCircle, 
  Printer, Download, MapPin, X, Users, Compass, Briefcase, 
  Activity, Star, FileSpreadsheet, ChevronRight, CheckSquare,
  Shield, Camera, Video, AlertTriangle
} from 'lucide-react';
import { Staff, Order } from '../../types';
import { formatDateDDMMYY, formatDateToDDMMYYYY } from '../../utils';
import { DateFilterInput } from '../ui/DateFilterInput';

import { formatTime12Hour } from "../../utils";

export const OperationsAnalytics: React.FC = () => {
  const { 
    orders, 
    operations, 
    staff, 
    staffAssignments 
  } = useRole();

  // Unified persistent filters using sessionStorage for cross-tab syncing
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('ops_search') || '');
  const [startDateInput, setStartDateInput] = useState(() => sessionStorage.getItem('ops_start_date') || '');
  const [endDateInput, setEndDateInput] = useState(() => sessionStorage.getItem('ops_end_date') || '');
  
  const [appliedSearch, setAppliedSearch] = useState(() => sessionStorage.getItem('ops_search') || '');
  const [appliedStartDate, setAppliedStartDate] = useState(() => sessionStorage.getItem('ops_start_date') || '');
  const [appliedEndDate, setAppliedEndDate] = useState(() => sessionStorage.getItem('ops_end_date') || '');

  // Synchronize on mount/changes
  useEffect(() => {
    const handleStorageChange = () => {
      setSearchQuery(sessionStorage.getItem('ops_search') || '');
      setStartDateInput(sessionStorage.getItem('ops_start_date') || '');
      setEndDateInput(sessionStorage.getItem('ops_end_date') || '');
      setAppliedSearch(sessionStorage.getItem('ops_search') || '');
      setAppliedStartDate(sessionStorage.getItem('ops_start_date') || '');
      setAppliedEndDate(sessionStorage.getItem('ops_end_date') || '');
    };
    window.addEventListener('storage_sync', handleStorageChange);
    return () => window.removeEventListener('storage_sync', handleStorageChange);
  }, []);

  // Selected KPI Card for detailed table view (Defaults to total_events)
  const [selectedCard, setSelectedCard] = useState<string>('total_events');

  // Selected Staff for detailed side-panel view
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Today's Date Anchor from Metadata (2026-06-18)
  const todayStr = '2026-06-18';

  // Helper: Format Dates cleanly
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return formatDateDDMMYY(dateStr) || dateStr;
  };

  // Helper: Retrieve all orders assigned to a specific staff member
  const getStaffAssignedOrders = (staffMember: Staff, listSource: Order[]) => {
    return listSource.filter(o => {
      // 1. Check operations record
      const op = operations.find(opItem => opItem.order_id === o.order_id);
      if (op) {
        const isAssignedInOp = 
          op.photographer_assigned === staffMember.name ||
          op.videographer_assigned === staffMember.name ||
          op.drone_operator_assigned === staffMember.name ||
          op.assistant_assigned === staffMember.name;
        if (isAssignedInOp) return true;
      }
      
      // 2. Check staffAssignments multi-role collection
      const sa = staffAssignments?.some(saItem => 
        saItem.order_id === o.order_id && 
        (saItem.staff_id === staffMember.staff_id || saItem.staff_name === staffMember.name) &&
        saItem.assignment_status !== 'Cancelled'
      );
      return !!sa;
    });
  };

  // Helper: Get formatted assigned crew string
  const getAssignedCrewString = (orderId: string) => {
    const op = operations.find(o => o.order_id === orderId);
    const names: string[] = [];
    if (op) {
      if (op.photographer_assigned) names.push(`${op.photographer_assigned} (Photo)`);
      if (op.videographer_assigned) names.push(`${op.videographer_assigned} (Video)`);
      if (op.drone_operator_assigned && op.drone_operator_assigned !== 'None') names.push(`${op.drone_operator_assigned} (Drone)`);
      if (op.assistant_assigned && op.assistant_assigned !== 'None') names.push(`${op.assistant_assigned} (Assistant)`);
    }

    const sa = staffAssignments?.filter(s => s.order_id === orderId && s.assignment_status !== 'Cancelled') || [];
    sa.forEach(item => {
      const label = `${item.staff_name} (${item.staff_role})`;
      if (!names.some(n => n.startsWith(item.staff_name))) {
        names.push(label);
      }
    });

    return names.length > 0 ? names.join(', ') : 'No staff assigned yet';
  };

  // Helper: Get Reporting Time of Event
  const getReportingTimeOfEvent = (orderId: string) => {
    const o = orders.find(ord => ord.order_id === orderId);
    const op = operations.find(o => o.order_id === orderId);
    return formatTime12Hour(op?.reporting_time || o?.reporting_time || o?.event_time) || 'N/A';
  };

  // Apply filters to data (Start Date, End Date, and Search Query)
  const filteredOrders = orders.filter(o => {
    const matchesSearch = appliedSearch === '' || 
      o.customer_name.toLowerCase().includes(appliedSearch.toLowerCase()) ||
      o.order_id.toLowerCase().includes(appliedSearch.toLowerCase()) || 
      o.event_type.toLowerCase().includes(appliedSearch.toLowerCase()) ||
      o.event_location.toLowerCase().includes(appliedSearch.toLowerCase());
    
    const matchesStart = appliedStartDate === '' || o.event_date >= appliedStartDate;
    const matchesEnd = appliedEndDate === '' || o.event_date <= appliedEndDate;
    
    return matchesSearch && matchesStart && matchesEnd && o.current_stage !== 'Closed';
  });

  // Filter staff according to any filters if needed, but standard directory uses real-time state
  const filteredStaff = staff;

  // Handlers for Filters
  const handleApplyFilters = () => {
    sessionStorage.setItem('ops_search', searchQuery);
    sessionStorage.setItem('ops_start_date', startDateInput);
    sessionStorage.setItem('ops_end_date', endDateInput);
    
    setAppliedSearch(searchQuery);
    setAppliedStartDate(startDateInput);
    setAppliedEndDate(endDateInput);

    // Notify any other components of the sync values
    window.dispatchEvent(new Event('storage_sync'));
  };

  const handleResetFilters = () => {
    sessionStorage.removeItem('ops_search');
    sessionStorage.removeItem('ops_start_date');
    sessionStorage.removeItem('ops_end_date');

    setSearchQuery('');
    setStartDateInput('');
    setEndDateInput('');
    setAppliedSearch('');
    setAppliedStartDate('');
    setAppliedEndDate('');

    window.dispatchEvent(new Event('storage_sync'));
  };

  // Exact Metric Definitions:
  const totalEvents = filteredOrders;
  const eventsScheduled = filteredOrders.filter(o => ['Assigned Crew', 'Event Scheduled', 'Staff Assigned', 'Operations Assigned'].includes(o.current_stage));
  const eventsCompleted = filteredOrders.filter(o => ['Event Ended', 'Footage Handover', 'Verified Footage', 'Event Completed', 'Raw Footage Received', 'Approved', 'Delivered'].includes(o.current_stage) || o.order_status === 'Completed');
  const upcomingEvents = filteredOrders.filter(o => o.event_date >= todayStr && !['Event Ended', 'Footage Handover', 'Verified Footage', 'Event Completed', 'Raw Footage Received', 'Delivered', 'Closed'].includes(o.current_stage));
  const ongoingEvents = filteredOrders.filter(o => o.event_date === todayStr);
  const overdueEvents = filteredOrders.filter(o => o.event_date < todayStr && !['Event Ended', 'Footage Handover', 'Verified Footage', 'Event Completed', 'Raw Footage Received', 'Approved', 'Delivered'].includes(o.current_stage));
  const rawFootageEvents = filteredOrders.filter(o => ['Footage Handover', 'Verified Footage', 'Raw Footage Received', 'Editor Assigned', 'Editing Started', 'Customer Review', 'Revision Required', 'Approved', 'Delivered'].includes(o.current_stage));

  const totalStaff = filteredStaff;
  const activeStaff = filteredStaff.filter(s => s.status === 'Active');
  
  const staffPendingEvents = filteredStaff.filter(s => {
    const assigned = getStaffAssignedOrders(s, filteredOrders);
    return assigned.some(o => ['Order Confirmed', 'Staff Assigned', 'Operations Assigned'].includes(o.current_stage));
  });

  const staffCompletedEvents = filteredStaff.filter(s => {
    const assigned = getStaffAssignedOrders(s, filteredOrders);
    return assigned.some(o => ['Event Completed', 'Raw Footage Received', 'Approved', 'Delivered'].includes(o.current_stage) || o.order_status === 'Completed');
  });

  // KPI metadata extraction
  const getSelectedCardData = () => {
    switch (selectedCard) {
      case 'total_events':
        return { title: 'Total Events', data: totalEvents, type: 'events' };
      case 'events_scheduled':
        return { title: 'Total Events Scheduled', data: eventsScheduled, type: 'events' };
      case 'events_completed':
        return { title: 'Total Events Completed', data: eventsCompleted, type: 'events' };
      case 'upcoming_events':
        return { title: 'Upcoming Events', data: upcomingEvents, type: 'events' };
      case 'ongoing_events':
        return { title: 'Ongoing Events', data: ongoingEvents, type: 'events' };
      case 'overdue_events':
        return { title: 'Overdue Events', data: overdueEvents, type: 'events' };
      case 'raw_footage':
        return { title: 'Raw Footage Received', data: rawFootageEvents, type: 'events' };
      case 'total_staff':
        return { title: 'Total Operations Staff', data: totalStaff, type: 'staff' };
      case 'active_staff':
        return { title: 'Active Staff', data: activeStaff, type: 'staff' };
      case 'staff_pending':
        return { title: 'Staff Pending Events', data: staffPendingEvents, type: 'staff' };
      case 'staff_completed':
        return { title: 'Staff Completed Events', data: staffCompletedEvents, type: 'staff' };
      default:
        return { title: 'Total Events', data: totalEvents, type: 'events' };
    }
  };

  const activeDetail = getSelectedCardData();

  // Status badge styling helper
  const getStageBadge = (stage: string) => {
    switch (stage) {
      case 'Order Confirmed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono">Order Confirmed</span>;
      case 'Assigned Crew':
      case 'Staff Assigned':
      case 'Event Scheduled':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono">Assigned Crew</span>;
      case 'Event Started':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">Event Started</span>;
      case 'Event Ended':
      case 'Event Completed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono">Event Ended</span>;
      case 'Footage Handover':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono">Footage Handover</span>;
      case 'Verified Footage':
      case 'Footage Handover Verified':
      case 'Raw Footage Received':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">Verified Footage</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-700/20 border border-zinc-650/30 text-zinc-300 font-mono">{stage}</span>;
    }
  };

  // REPORTS GENERATORS
  const handleDownloadCSV = () => {
    const headers = ["Order ID", "Customer Name", "Event Type", "Event Date", "Assigned Staff", "Current Status", "Reporting Time", "Created Date"];
    const rows = filteredOrders.map(o => [
      o.order_id,
      o.customer_name,
      o.event_type,
      formatDate(o.event_date),
      getAssignedCrewString(o.order_id).replace(/,/g, ';'),
      o.current_stage,
      getReportingTimeOfEvent(o.order_id),
      o.created_at ? formatDate(o.created_at) : 'N/A'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ops_Studio_Report_${appliedStartDate || 'All'}_to_${appliedEndDate || 'All'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadExcel = () => {
    const headers = ["Order ID", "Customer Name", "Event Type", "Event Date", "Assigned Staff", "Current Status", "Reporting Time", "Created Date"];
    const rows = filteredOrders.map(o => [
      o.order_id,
      o.customer_name,
      o.event_type,
      formatDate(o.event_date),
      getAssignedCrewString(o.order_id),
      o.current_stage,
      getReportingTimeOfEvent(o.order_id),
      o.created_at ? formatDate(o.created_at) : 'N/A'
    ]);
    
    const content = [headers.join("\t"), ...rows.map(e => e.join("\t"))].join("\n");
    const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Ops_Studio_Report_${appliedStartDate || 'All'}_to_${appliedEndDate || 'All'}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const rowsHtml = filteredOrders.map(o => `
      <tr>
        <td><b>${o.order_id}</b></td>
        <td>${o.customer_name}</td>
        <td>${o.event_type}</td>
        <td>${formatDate(o.event_date)}</td>
        <td>${getAssignedCrewString(o.order_id)}</td>
        <td>${o.current_stage}</td>
        <td>${getReportingTimeOfEvent(o.order_id)}</td>
        <td>${o.created_at ? formatDate(o.created_at.split('T')[0]) : 'N/A'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Photography Studio Registry - Operations Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 30px; color: #111827; background-color: #ffffff; }
            h1 { font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #000; margin: 0 0 5px 0; }
            .meta { font-size: 12px; color: #4b5563; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 20px; }
            th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
            th { background-color: #f3f4f6; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #374151; }
            tr:nth-child(even) { background-color: #f9fafb; }
            .footer { margin-top: 50px; font-size: 10px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; font-family: monospace; }
          </style>
        </head>
        <body>
          <h1>STUDIO OPERATIONS REGISTRY REPORT</h1>
          <div class="meta">
            Generator Time: ${formatDateDDMMYY(new Date())} | 
            Scope Range: ${appliedStartDate ? formatDate(appliedStartDate) : 'All Starts'} to ${appliedEndDate ? formatDate(appliedEndDate) : 'All Ends'} | 
            Active Matches Count: ${filteredOrders.length}
          </div>
          <div className="overflow-x-auto w-full max-w-full">
<table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Event Type</th>
                <th>Event Date</th>
                <th>Assigned Staff</th>
                <th>Current Status</th>
                <th>Reporting Time</th>
                <th>Created Date</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
</div>
          <div class="footer">Confidential System File - Photography Studio Executive Service</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">

      {/* COMMAND CONTROL / GLOBAL FILTER UTILITY BAR */}
      <div className="bg-zinc-950/60 p-5 rounded-2xl border border-zinc-850 shadow-2xl relative overflow-hidden">
        {/* Glass Reflection effect decorative border */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full" />
        
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-amber-500/20 bg-zinc-900 flex items-center justify-center shadow-lg relative">
              <div className="absolute inset-1.5 rounded-full border-2 border-dashed border-zinc-700 animate-[spin_30s_linear_infinite]" />
              <Camera className="w-5 h-5 text-amber-500 relative z-10" />
            </div>
            <div>
              <h3 className="text-sm font-black text-zinc-100 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <span>PHOTOGRAPHY OPERATIONS COMMAND</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded animate-pulse">LIVE FEED</span>
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1">Configure parameters to update all DSLR camera analytics, timetables, maps, and exportable directories in real time.</p>
            </div>
          </div>
          
          {/* Action Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrintReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-zinc-900 hover:bg-zinc-805 text-amber-400 border border-zinc-800 rounded-lg transition-all cursor-pointer shadow-md select-none"
              title="Print standard report"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
            
            <button
              onClick={handlePrintReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-zinc-900 hover:bg-zinc-805 text-rose-400 border border-zinc-800 rounded-lg transition-all cursor-pointer shadow-md select-none"
              title="Save report as physical PDF file via Print settings"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-zinc-900 hover:bg-zinc-805 text-emerald-400 border border-zinc-800 rounded-lg transition-all cursor-pointer shadow-md select-none"
              title="Export spreadsheet format"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-zinc-900 hover:bg-zinc-850 text-indigo-450 border border-zinc-800 rounded-lg transition-all cursor-pointer shadow-md select-none"
              title="Export CSV text"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Filters Grid Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-5 mt-4 border-t border-zinc-900 relative z-10">
          <div className="md:col-span-4">
            <label className="block text-[10px] uppercase font-mono font-black text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-amber-500" />
              <span>Search Events / Customers / Venues</span>
            </label>
            <input
              type="text"
              placeholder="Search ID, customer, category, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl py-1.5 px-3 text-xs text-zinc-100 font-sans focus:outline-none focus:border-amber-500 transition-all placeholder-zinc-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[10px] uppercase font-mono font-black text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span>Start Date (Inclusive)</span>
            </label>
            <DateFilterInput
              value={startDateInput}
              onChange={setStartDateInput}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-1.5 px-3 text-xs text-zinc-100 font-mono focus:border-amber-500"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[10px] uppercase font-mono font-black text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span>End Date (Inclusive)</span>
            </label>
            <DateFilterInput
              value={endDateInput}
              onChange={setEndDateInput}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-1.5 px-3 text-xs text-zinc-100 font-mono focus:border-amber-500"
            />
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button
              onClick={handleApplyFilters}
              className="flex-1 flex items-center justify-center bg-amber-500 hover:bg-amber-450 hover:shadow-lg hover:shadow-amber-500/10 py-1.5 text-xs font-mono font-bold text-zinc-950 rounded-xl transition-all cursor-pointer font-bold uppercase select-none"
            >
              APPLY
            </button>
            <button
              onClick={handleResetFilters}
              className="flex-1 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 py-1.5 text-xs font-mono font-bold text-zinc-300 rounded-xl transition-all cursor-pointer select-none"
              title="Clear text query and date boundaries"
            >
              RESET
            </button>
          </div>
        </div>
      </div>

      {/* OPERATIONS ANALYTICS CARDS GRID (CAMERA LENS & DSLR STYLE) */}
      <div className="space-y-3">
        <div className="border-b border-zinc-900 pb-2.5 flex items-center justify-between">
          <span className="text-xs font-mono font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>OPERATIONS PIPELINE TELEMETRY (10 METRICS CARD RING)</span>
          </span>
          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900">
            Filtered matching records: {filteredOrders.length}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {[
            { id: 'total_events', label: 'Total Events', val: totalEvents.length, desc: 'Overall registry scope', color: 'text-indigo-400', focal: '50mm' },
            { id: 'events_scheduled', label: 'Events Scheduled', val: eventsScheduled.length, desc: 'Assignments confirmed', color: 'text-violet-400', focal: '85mm' },
            { id: 'upcoming_events', label: 'Upcoming Events', val: upcomingEvents.length, desc: 'Scheduled future dates', color: 'text-blue-400', focal: '70-200mm' },
            { id: 'ongoing_events', label: 'Ongoing Events', val: ongoingEvents.length, desc: 'Active shoots today', color: 'text-rose-400', focal: '24mm' },
            { id: 'overdue_events', label: 'Overdue Events', val: overdueEvents.length, desc: 'Action required!', color: 'text-amber-500', focal: '16mm' },
            { id: 'raw_footage', label: 'Raw Footage Received', val: rawFootageEvents.length, desc: 'Footage logs stored', color: 'text-orange-400', focal: '135mm' },
            { id: 'total_staff', label: 'Total Staff', val: totalStaff.length, desc: 'Consolidated roster', color: 'text-slate-300', focal: 'AF-C' },
            { id: 'active_staff', label: 'Active Staff', val: activeStaff.length, desc: 'Available for shoot', color: 'text-emerald-400', focal: 'MF' },
            { id: 'staff_pending', label: 'Staff Pending Events', val: staffPendingEvents.length, desc: 'Work coordination lock', color: 'text-yellow-500', focal: 'ISO 100' },
            { id: 'staff_completed', label: 'Staff Completed Events', val: staffCompletedEvents.length, desc: 'High rating delivery', color: 'text-cyan-400', focal: 'ISO 400' },
          ].map((card) => {
            const isSelected = selectedCard === card.id;
            return (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card.id)}
                className={`p-4 rounded-xl relative overflow-hidden backdrop-blur-md shadow-xl border cursor-pointer select-none transition-all duration-300 hover:-translate-y-1 text-left ${
                  isSelected 
                    ? 'bg-zinc-950/90 border-amber-500 ring-2 ring-amber-500/20 shadow-amber-500/10' 
                    : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-800 hover:bg-zinc-900/80'
                } before:absolute before:inset-0 before:bg-gradient-to-tr before:from-transparent before:via-white/5 before:to-transparent before:-translate-x-full hover:before:translate-x-full before:transition-transform before:duration-1000 before:ease-out`}
              >
                {/* Concentric lens ring vector behind values */}
                <div className={`absolute -right-5 -bottom-5 w-20 h-20 rounded-full border border-dashed pointer-events-none transition-transform duration-1000 ${
                  isSelected ? 'border-amber-500/20 animate-[spin_20s_linear_infinite] scale-110' : 'border-zinc-800/40'
                }`} />
                <div className="absolute right-3 top-3 w-1 h-3 bg-zinc-800/30 rounded pointer-events-none" />

                {/* DSLR focus corner indicator lines */}
                {isSelected && (
                  <>
                    <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t-2 border-l-2 border-amber-500/90" />
                    <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t-2 border-r-2 border-amber-500/90" />
                    <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b-2 border-l-2 border-amber-500/90" />
                    <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b-2 border-r-2 border-amber-500/90" />
                  </>
                )}

                {/* Header lens metrics */}
                <div className="flex items-start justify-between gap-1.5">
                  <span className="text-[9px] uppercase font-mono tracking-widest font-black text-zinc-400 break-words leading-tight flex-1 min-w-0">{card.label}</span>
                  <span className="text-[8px] font-mono font-bold text-zinc-500 shrink-0">{card.focal}</span>
                </div>

                {/* KPI value */}
                <div className="mt-3.5 flex items-baseline justify-between relative z-10">
                  <span className={`text-2xl font-black font-mono tracking-tight transition-all duration-300 ${isSelected ? 'text-amber-400' : card.color}`}>
                    {card.val}
                  </span>
                  {isSelected && <span className="text-[8px] text-amber-500 font-bold font-mono tracking-wider animate-pulse">[FOCUS ENGAGED]</span>}
                </div>

                {/* Description */}
                <p className="text-[9px] text-zinc-500 mt-2.5 font-mono leading-tight break-words">{card.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* DETAILED TABLE VIEW (DYNAMIC TARGET RECORD DRILLDOWN) */}
      <div className="bg-zinc-950/60 border border-zinc-850 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        {/* Decorative corner vectors */}
        <div className="absolute top-3 left-3 w-1.5 h-1.5 border-t border-l border-amber-500/40" />
        <div className="absolute top-3 right-3 w-1.5 h-1.5 border-t border-r border-amber-500/40" />
        <div className="absolute bottom-3 left-3 w-1.5 h-1.5 border-b border-l border-amber-500/40" />
        <div className="absolute bottom-3 right-3 w-1.5 h-1.5 border-b border-r border-amber-500/40" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-900 pb-3 mb-4 gap-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-450 px-2 py-0.5 rounded font-mono font-bold">DRILLDOWN TABLE</span>
            <h4 className="text-xs font-mono font-black text-zinc-100 uppercase tracking-widest">
              {activeDetail.title} ({activeDetail.data.length} Matches)
            </h4>
          </div>
          <span className="text-[10px] font-mono text-zinc-550">
            Active Filter Set: {appliedStartDate || 'Anytime'} to {appliedEndDate || 'Anytime'}
          </span>
        </div>

        {activeDetail.data.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 border border-dashed border-zinc-850 rounded-xl font-mono text-xs italic">
            Zero matches found. Verify that your filter inputs are accurate or try searching for another term.
          </div>
        ) : activeDetail.type === 'events' ? (
          /* EVENT DRILLDOWN TABLE */
          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-900 text-[10px] text-zinc-450 uppercase font-mono bg-zinc-900/30">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Customer Name</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Event Date</th>
                  <th className="py-2.5 px-3">Assigned Staff</th>
                  <th className="py-2.5 px-3">Current Status</th>
                  <th className="py-2.5 px-3">Reporting Time</th>
                  <th className="py-2.5 px-3">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 font-mono text-[11px] text-zinc-300">
                {(activeDetail.data as Order[]).map((o) => (
                  <tr key={o.order_id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-zinc-200">{o.order_id}</td>
                    <td className="py-2.5 px-3 text-zinc-100 font-sans font-medium">{o.customer_name}</td>
                    <td className="py-2.5 px-3 text-zinc-400">{o.event_type}</td>
                    <td className="py-2.5 px-3 text-zinc-200">{formatDate(o.event_date)}</td>
                    <td className="py-2.5 px-3 text-zinc-400 break-words max-w-xs font-sans text-[11px]">
                      {getAssignedCrewString(o.order_id)}
                    </td>
                    <td className="py-2.5 px-3">{getStageBadge(o.current_stage)}</td>
                    <td className="py-2.5 px-3 text-amber-400">{getReportingTimeOfEvent(o.order_id)}</td>
                    <td className="py-2.5 px-3 text-zinc-500">{o.created_at ? o.created_at.split('T')[0] : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* STAFF DRILLDOWN ROSTER */
          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-900 text-[10px] text-zinc-450 uppercase font-mono bg-zinc-900/30">
                  <th className="py-2.5 px-3">Staff ID</th>
                  <th className="py-2.5 px-3">Staff Name</th>
                  <th className="py-2.5 px-3">Designated Role</th>
                  <th className="py-2.5 px-3">Contact Email</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Details Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 font-mono text-[11px] text-zinc-300">
                {(activeDetail.data as Staff[]).map((s) => {
                  const assigned = getStaffAssignedOrders(s, filteredOrders);
                  return (
                    <tr key={s.staff_id} className="hover:bg-zinc-900/30 transition-colors">
                      <td className="py-2.5 px-3 text-zinc-400">{s.staff_id}</td>
                      <td className="py-2.5 px-3 text-zinc-100 font-sans font-bold">{s.name}</td>
                      <td className="py-2.5 px-3 text-indigo-400">{s.role}</td>
                      <td className="py-2.5 px-3 text-zinc-400 font-sans">{s.email}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          s.status === 'Active' 
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                            : 'bg-zinc-800/10 border border-zinc-850 text-zinc-500'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-1 px-3">
                        <button 
                          onClick={() => setSelectedStaff(s)}
                          className="text-amber-500 hover:text-amber-400 font-mono text-[10px] flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          Roster File [{assigned.length} Events] ➔
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STAFF PERFORMANCE ROSTER TABLE */}
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-2xl relative">
        <div className="border-b border-zinc-900 pb-3 mb-4 flex items-center justify-between">
          <h4 className="text-xs font-mono font-black text-zinc-300 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>OPERATIONAL STAFF PERFORMANCE DIRECTORY & ASSIGNMENTS</span>
          </h4>
          <span className="text-[9px] text-zinc-400 font-mono bg-zinc-950 px-2 py-0.5 border border-zinc-900 rounded">
            Click row anywhere to load detailed staff schedule
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-900 text-[10px] text-zinc-450 uppercase font-mono bg-zinc-950/40">
                <th className="py-3 px-4">Staff Name</th>
                <th className="py-3 px-4">Staff Role</th>
                <th className="py-3 px-4 text-center">Assigned Events</th>
                <th className="py-3 px-4 text-center">Scheduled Events</th>
                <th className="py-3 px-4 text-center">Completed Events</th>
                <th className="py-3 px-4 text-center">Pending Events</th>
                <th className="py-3 px-4 text-center">Current Active Events</th>
                <th className="py-3 px-4 text-right">Completion Rate %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 font-mono text-[11px] text-zinc-300">
              {filteredStaff.map((s) => {
                const assigned = getStaffAssignedOrders(s, filteredOrders);
                const scheduled = assigned.filter(o => ['Event Scheduled', 'Staff Assigned', 'Operations Assigned'].includes(o.current_stage));
                const completed = assigned.filter(o => ['Event Completed', 'Raw Footage Received', 'Approved', 'Delivered'].includes(o.current_stage) || o.order_status === 'Completed');
                const pending = assigned.filter(o => ['Order Confirmed', 'Staff Assigned', 'Operations Assigned'].includes(o.current_stage));
                const isOngoingToday = assigned.filter(o => o.event_date === todayStr && !['Event Completed', 'Raw Footage Received'].includes(o.current_stage));

                const completionRate = assigned.length > 0 
                  ? Math.round((completed.length / assigned.length) * 100) 
                  : 100;

                const isSelected = selectedStaff?.staff_id === s.staff_id;

                return (
                  <tr 
                    key={s.staff_id} 
                    onClick={() => setSelectedStaff(s)}
                    className={`hover:bg-zinc-850/50 transition-all cursor-pointer ${isSelected ? 'bg-zinc-800/60 border-l-4 border-amber-500' : ''}`}
                  >
                    <td className="py-3 px-4 font-bold text-zinc-100 flex items-center gap-2">
                      <span className="text-zinc-500 text-xs text-amber-500">📷</span>
                      <span className="font-sans text-[12px]">{s.name}</span>
                    </td>
                    <td className="py-3 px-4 text-indigo-300 text-xs font-sans">{s.role}</td>
                    <td className="py-3 px-4 text-center font-bold text-zinc-150">{assigned.length}</td>
                    <td className="py-3 px-4 text-center text-violet-400 font-bold">{scheduled.length}</td>
                    <td className="py-3 px-4 text-center text-emerald-450 font-bold">{completed.length}</td>
                    <td className="py-3 px-4 text-center text-yellow-500 font-bold">{pending.length}</td>
                    <td className="py-3 px-4 text-center text-rose-450 font-bold">{isOngoingToday.length}</td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span className={`px-2 py-0.5 rounded font-black ${getCompletionRateColor(completionRate)}`}>
                        {completionRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* STAFF DETAILED MODAL / SLIDE DRAW PANEL */}
      {selectedStaff && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full w-full max-w-3xl overflow-hidden shadow-2xl relative text-left">
            
            {/* Header border decor focus ring corner */}
            <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-amber-500/80" />
            <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-amber-500/80" />
            <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-amber-500/80" />
            <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-amber-500/80" />

            {/* Title Bar */}
            <div className="bg-zinc-900 p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera className="w-5 h-5 text-amber-550" />
                <div>
                  <h3 className="text-xs font-black uppercase font-mono tracking-widest text-amber-400">STATION ASSIGNMENTS SHEET</h3>
                  <p className="text-[11px] text-zinc-400 font-sans">Active operational history files for <b>{selectedStaff.name}</b> // {selectedStaff.role}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStaff(null)} 
                className="px-2.5 py-1 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer text-xs border border-zinc-800 font-mono"
              >
                ✕ Exit
              </button>
            </div>

            {/* Dialog Body Content */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-900 p-4 border border-zinc-800 rounded-xl font-mono text-[11px] text-zinc-400">
                <div>
                  <span className="text-zinc-550 block text-[9px] uppercase">Roster Status</span>
                  <span className="text-emerald-400 uppercase font-black">{selectedStaff.status}</span>
                </div>
                <div>
                  <span className="text-zinc-550 block text-[9px] uppercase">Mobile Number</span>
                  <span className="text-zinc-200 font-sans">{selectedStaff.mobile || '—'}</span>
                </div>
                <div>
                  <span className="text-zinc-550 block text-[9px] uppercase">Roster Department</span>
                  <span className="text-zinc-200 font-sans">{selectedStaff.department || 'Operations Team'}</span>
                </div>
              </div>

              <div className="border-b border-zinc-850 pb-1.5 flex justify-between items-center">
                <span className="text-[10px] font-mono uppercase text-zinc-350 font-black tracking-widest">
                  Active Shoots Allocated ({getStaffAssignedOrders(selectedStaff, filteredOrders).length} Records)
                </span>
              </div>

              {getStaffAssignedOrders(selectedStaff, filteredOrders).length === 0 ? (
                <div className="p-8 text-center text-zinc-550 border border-dashed border-zinc-800 rounded-xl italic font-mono text-xs">
                  Nothing allocated matching current filter boundaries.
                </div>
              ) : (
                <div className="space-y-3 font-sans text-xs">
                  {getStaffAssignedOrders(selectedStaff, filteredOrders).map((ord) => {
                    return (
                      <div 
                        key={ord.order_id} 
                        className="bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all relative"
                      >
                        <div className="absolute top-0 bottom-0 left-0 w-1 bg-amber-500 rounded-l" />

                        <div className="space-y-1 pl-2">
                          <div className="flex items-center gap-2">
                            <span className="bg-zinc-950 border border-zinc-805 px-1.5 py-0.5 text-[9px] font-mono rounded text-zinc-400 font-bold">
                              {ord.order_id}
                            </span>
                            <span className="font-bold text-zinc-100">{ord.customer_name}</span>
                          </div>
                          
                          <div className="text-[11px] text-zinc-400 font-mono space-y-0.5">
                            <div>🗓️ Date: <span className="text-zinc-200 font-bold">{formatDate(ord.event_date)}</span></div>
                            <div>🚀 Location: <span className="text-zinc-250 break-words">{ord.event_location}</span></div>
                            <div>⏰ Reporting Time: <span className="text-amber-400 font-bold">{getReportingTimeOfEvent(ord.order_id)}</span></div>
                          </div>
                        </div>

                        <div className="flex sm:flex-col justify-between items-end gap-1.5 font-mono">
                          {getStageBadge(ord.current_stage)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Workspace Action */}
            <div className="bg-zinc-900 p-4 border-t border-zinc-800 text-right">
              <button 
                onClick={() => setSelectedStaff(null)} 
                className="px-5 py-2 rounded-lg bg-indigo-650 hover:bg-indigo-600 text-xs font-black text-white hover:shadow-lg transition-all cursor-pointer font-sans"
              >
                Close File View
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Helper: Color indicators for Rate
function getCompletionRateColor(rate: number): string {
  if (rate >= 90) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (rate >= 70) return 'bg-sky-500/10 text-sky-450 border border-sky-500/20';
  if (rate >= 50) return 'bg-amber-500/10 text-amber-550 border border-amber-500/20';
  return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
}
