import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Printer, Search, FileSpreadsheet, FileDown, CheckCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { DatePreset, DateRange, getPresetDateRange, isDateInRange, TODAY_REF } from './DateFilterHelper';
import { DatePresetSelector } from './DatePresetSelector';
import { formatINR, formatDateDDMMYY } from '../../utils';
import { EVENT_TYPES } from '../../types';
import { jsPDF } from 'jspdf';
import { useRole } from '../RoleContext';
import * as XLSX from 'xlsx';
import { DateFilterInput } from '../ui/DateFilterInput';

interface AnalyticsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportTitle: string;
  reportType: 'sales' | 'operations' | 'production' | 'business_overview';
  cardName: string;
  initialPreset?: DatePreset;
  initialCustomRange?: DateRange;
  // Raw records from RoleContext
  leads: any[];
  orders: any[];
  payments: any[];
  operations: any[];
  production: any[];
  staff: any[];
}

export const AnalyticsReportModal: React.FC<AnalyticsReportModalProps> = ({
  isOpen,
  onClose,
  reportTitle,
  reportType,
  cardName,
  leads,
  orders,
  payments,
  operations,
  production,
  staff
}) => {
  const { globalDateRange } = useRole();
  const [searchQuery, setSearchQuery] = useState('');
  const [localStartDate, setLocalStartDate] = useState(globalDateRange.start);
  const [localEndDate, setLocalEndDate] = useState(globalDateRange.end);
  const [statusFilter, setStatusFilter] = useState('All');
  const [eventTypeFilter, setEventTypeFilter] = useState('All');

  // Sync initial date range if context changes or component is reopened
  React.useEffect(() => {
    setLocalStartDate(globalDateRange.start);
    setLocalEndDate(globalDateRange.end);
  }, [globalDateRange, isOpen]);

  const uniqueStatuses = useMemo(() => {
    if (reportType !== 'sales') return ['All'];
    const statuses = new Set(leads.map(l => l.status).filter(Boolean));
    return ['All', ...Array.from(statuses)];
  }, [leads, reportType]);

  const uniqueEventTypes = useMemo(() => {
    if (reportType !== 'sales') return ['All'];
    const types = new Set<string>(EVENT_TYPES);
    leads.forEach(l => {
      if (l.event_type) types.add(l.event_type);
    });
    return ['All', ...Array.from(types)];
  }, [leads, reportType]);

  // 1. Compute current active range directly from context
  const currentRange = globalDateRange;

  // 2. Fetch appropriate tabular rows based on report type & metric card clicked
  const rawRows = useMemo(() => {
    if (!isOpen) return [];

    switch (reportType) {
      case 'sales': {
        return leads.map(l => {
          const order = orders.find(o => o.lead_id === l.lead_id || o.customer_name === l.customer_name);
          return {
            "Lead ID": l.lead_id || '—',
            "Order ID": order?.order_id || '—',
            "Customer Name": l.customer_name || '—',
            "Mobile Number": l.mobile || '—',
            "Event Type": l.event_type === 'Other' ? (l.custom_event_name || l.custom_event_type || 'Other') : (l.event_type || '—'),
            "Event Date": l.event_date || '—',
            "Current Status": l.status || '—',
            "Lead Source": l.lead_source || '—',
            "Created Date": l.created_date || '—'
          };
        }).filter(row => {
          const name = cardName.trim();
          if (name === 'New Leads') return row["Current Status"] === 'New Lead';
          if (name === 'Follow-up Pending' || name === 'Follow-Ups') return row["Current Status"] === 'Follow Up' || row["Current Status"] === 'Follow-Up';
          if (name === 'Quotation Sent' || name === 'Quotations Sent') return row["Current Status"] === 'Quotation Sent';
          if (name === 'Negotiation' || name === 'Negotiation Leads') return row["Current Status"] === 'Negotiation';
          if (name === 'Order Confirmed' || name === 'Confirmed Orders' || name === 'Conversion Rate' || name === 'Total Event Value') {
            return row["Current Status"] === 'Order Confirmed' || row["Current Status"] === 'Approved';
          }
          if (name === 'Lost Leads') {
            return row["Current Status"] === 'Lost Lead' || row["Current Status"] === 'Cancelled' || row["Current Status"] === 'Lost';
          }
          if (name === 'Upcoming Events') {
            return (row["Current Status"] === 'Order Confirmed' || row["Current Status"] === 'Approved') && row["Event Date"] >= TODAY_REF;
          }
          return true; // "Total Leads"
        });
      }

      case 'operations': {
        return orders.map(o => {
          const op = operations.find(x => x.order_id === o.order_id);
          const staffAssigned = op 
            ? [op.photographer_assigned, op.videographer_assigned, op.drone_operator_assigned].filter(name => name && name !== 'None').join(', ')
            : 'Unassigned';

          return {
            "Order ID": o.order_id || '—',
            "Customer Name": o.customer_name || 'CRM Client',
            "Event Date": o.event_date || '—',
            "Assigned Team": staffAssigned || 'None',
            "Event Status": o.current_stage || '—',
            "Reporting Time": op?.reporting_time || '—',
            "Order Date": o.created_at && typeof o.created_at === 'string' ? o.created_at.split('T')[0] : o.event_date
          };
        }).filter(row => {
          const name = (cardName || '').trim().toLowerCase();
          if (name.includes('new project') || name.includes('new order') || name.includes('orders received') || name.includes('order confirmed')) {
            return ['Order Confirmed', 'Confirm Order', 'New Order Received'].includes(row["Event Status"]);
          }
          if (name.includes('scheduled') || name.includes('event scheduled')) return ['Event Scheduled', 'Operations Assigned', 'Assigned Crew'].includes(row["Event Status"]);
          if (name.includes('staff assigned') || name.includes('assigned crew')) return row["Assigned Team"] !== 'None' && row["Assigned Team"] !== 'Unassigned';
          if (name.includes('completed') || name.includes('event ended') || name.includes('event completed')) return ['Event Completed', 'Event Ended', 'Event Complete', 'Closed', 'Delivered'].includes(row["Event Status"]);
          if (name.includes('event started')) return ['Event Started', 'Event Start'].includes(row["Event Status"]);
          if (name.includes('footage handover')) return ['Footage Handover', 'Equipment Handover'].includes(row["Event Status"]);
          if (name.includes('verified footage') || name.includes('raw footage')) return ['Verified Footage', 'Footage Handover Verified', 'Raw Footage Received'].includes(row["Event Status"]);
          if (name.includes('upcoming')) return row["Event Date"] >= TODAY_REF;
          if (name.includes('today')) return row["Event Date"] === TODAY_REF;
          if (name.includes('overdue')) return row["Event Date"] < TODAY_REF && !['Event Completed', 'Closed', 'Delivered'].includes(row["Event Status"]);
          return true;
        });
      }

      case 'production': {
        return production.map(p => {
          const order = orders.find(o => o.order_id === p.tracking_id || o.order_id === p.production_id || o.lead_id === p.original_lead_id);
          return {
            "Order ID": order?.order_id || p.tracking_id || '—',
            "Customer Name": order?.customer_name || p.customer_name || 'CRM Client',
            "Event Type": (() => {
              const orderType = order?.event_type;
              if (orderType === 'Other') {
                return order?.custom_event_name || order?.custom_event_type || 'Other';
              }
              const pType = p.event_type;
              if (pType === 'Other') {
                return p.custom_event_type || 'Other';
              }
              return orderType || pType || '—';
            })(),
            "Event Date": order?.event_date || p.event_date || '—',
            "Assigned Editors": p.editor_assigned || 'Unassigned',
            "Current Status": p.editing_status || '—',
            "Target Delivery Date": p.target_delivery_date || p.expected_delivery_date || '—'
          };
        }).filter(row => {
          const name = (cardName || '').trim().toLowerCase();
          if (name === 'total production projects' || name === 'total production' || name.includes('complete production')) return true;
          if (name.includes('new project') || name.includes('verified footage')) return ['Verified Footage', 'Footage Handover Verified'].includes(row["Current Status"]);
          if (name.includes('raw footage')) return ['Raw Footage Received', 'Verified Footage', 'Footage Handover Verified'].includes(row["Current Status"]);
          if (name.includes('in progress') || name.includes('editing started')) {
            return ['Editing Started', 'Editing In Progress', 'Internal QC Review', 'Assigned Editor', 'Editor Assigned'].includes(row["Current Status"]);
          }
          if (name.includes('client approved') || name.includes('final approval') || name.includes('approved')) {
            return ['Final Approval', 'Approved', 'Client Acceptance', 'Completed', 'Project Completed', 'Project Delivered', 'Delivered'].includes(row["Current Status"]);
          }
          if (name.includes('not approved') || name.includes('review') || name.includes('revision')) {
            return ['Client Review Sent', 'Customer Review', 'Revision Required', 'Revision In Progress'].includes(row["Current Status"]);
          }
          if (name.includes('completed') || name.includes('delivered') || name.includes('closed')) {
            return ['Project Delivered', 'Delivered', 'Project Closed', 'Closed', 'Completed', 'Project Completed', 'Order Closed'].includes(row["Current Status"]);
          }
          if (name.includes('editor assigned')) return ['Editor Assigned', 'Assigned Editor'].includes(row["Current Status"]);
          if (name.includes('qc review')) return ['Internal QC Review'].includes(row["Current Status"]);
          return true;
        });
      }

      case 'business_overview': {
        const isFinances = cardName.includes('Revenue') || 
                           cardName.includes('Amount') || 
                           cardName.includes('Outstanding') || 
                           cardName.includes('Balance') || 
                           cardName.includes('Paid') || 
                           cardName.includes('Payment');

        if (isFinances) {
          return payments.map(p => {
            const order = orders.find(o => o.order_id === p.order_id);
            const receivedDate = p.payment_date || (order?.created_at && typeof order.created_at === 'string' ? order.created_at.split('T')[0] : '—');
            return {
              "Record ID": p.payment_id || '—',
              "Customer Name": order?.customer_name || 'CRM Client',
              "Amount": p.quotation_amount || 0,
              "Paid Amount": (p.advance_received || 0) + (p.final_payment_received || 0),
              "Balance Due": p.balance_due || 0,
              "Payment Status": p.payment_status || 'Pending',
              "Received Date": receivedDate,
              "Created Date": order?.created_at && typeof order.created_at === 'string' ? order.created_at.split('T')[0] : order?.event_date || '—'
            };
          }).filter(row => {
            if (cardName === 'Total Pending Amount' || cardName === 'Outstanding Balance') return row["Balance Due"] > 0;
            if (cardName === 'Partial Payment Amount' || cardName === 'Partially Paid Events') return row["Payment Status"] === 'Partially Paid';
            if (cardName === 'Fully Paid Events') return row["Payment Status"] === 'Fully Paid';
            if (cardName === 'Pending Payment Events') return row["Payment Status"] === 'Pending';
            return true;
          });
        } else if (cardName.includes('Staff') || cardName.includes('Editors') || cardName.includes('Workload') || cardName.includes('Projects')) {
          if (cardName === 'Active Staff') {
            return staff.filter(s => s.status === 'Active').map(s => ({
              "Staff ID": s.staff_id || '—',
              "Staff Name": s.name || '—',
              "Role": s.role || '—',
              "Department": s.department || '—',
              "Status": s.status || 'Active',
              "Joining Date": s.joining_date || '—'
            }));
          } else if (cardName === 'Active Editors') {
            const activeEditors = Array.from(new Set(production.map(p => p.editor_assigned).filter(e => e && e !== 'Unassigned')));
            return staff.filter(s => activeEditors.includes(s.name)).map(s => ({
              "Staff ID": s.staff_id || '—',
              "Staff Name": s.name || '—',
              "Role": s.role || '—',
              "Department": s.department || '—',
              "Status": s.status || 'Active',
              "Joining Date": s.joining_date || '—'
            }));
          } else {
            return production.map(p => {
              const order = orders.find(o => o.order_id === p.tracking_id);
              return {
                "Project ID": p.production_id || '—',
                "Customer Name": order?.customer_name || 'CRM Client',
                "Editor Name": p.editor_assigned || 'Unassigned',
                "Editing Status": p.editing_status || '—',
                "Priority": p.project_priority || 'Medium',
                "Event Date": order?.event_date || '—'
              };
            }).filter(row => {
              if (cardName === 'Active Projects') return row["Editing Status"] !== 'Project Closed';
              return true;
            });
          }
        } else {
          return orders.map(o => ({
            "Order ID": o.order_id || '—',
            "Customer Name": o.customer_name || 'CRM Client',
            "Event Type": o.event_type === 'Other' ? (o.custom_event_name || o.custom_event_type || 'Other') : (o.event_type || '—'),
            "Event Date": o.event_date || '—',
            "Amount": o.quotation_amount || 0,
            "Status": o.current_stage || '—'
          })).filter(row => {
            if (cardName === 'Completed Events') return row["Status"] === 'Event Completed' || row["Status"] === 'Closed' || row["Status"] === 'Delivered';
            if (cardName === 'Upcoming Events') return row["Event Date"] >= TODAY_REF;
            if (cardName === 'Ongoing Events') return row["Event Date"] === TODAY_REF;
            if (cardName === 'Cancelled Events') return row["Status"] === 'Closed' && row["Amount"] === 0;
            return true;
          });
        }
      }
      default:
        return [];
    }
  }, [isOpen, reportType, cardName, leads, orders, operations, production, payments, staff]);

  // 3. Search and filter rows
  const filteredRows = useMemo(() => {
    let result = rawRows;

    // Filter by local date range
    result = result.filter(row => {
      const dateVal = row["Created Date"] || row["Event Date"] || row["Order Date"] || row["Joining Date"] || row["Received Date"] || '';
      if (!dateVal || dateVal === '—') return true;
      const cleanDate = dateVal.split('T')[0];
      return cleanDate >= localStartDate && cleanDate <= localEndDate;
    });

    // Filter by status dropdown
    if (statusFilter !== 'All') {
      result = result.filter(row => {
        const val = row["Current Status"] || row["Status"] || row["Event Status"] || row["Editing Status"] || row["Payment Status"] || '';
        return String(val).toLowerCase() === statusFilter.toLowerCase();
      });
    }

    // Filter by event type dropdown
    if (eventTypeFilter !== 'All') {
      result = result.filter(row => {
        const val = row["Event Type"] || '';
        return String(val).toLowerCase() === eventTypeFilter.toLowerCase();
      });
    }

    // Search query match
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row => {
        return Object.values(row).some(val => 
          String(val ?? '').toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [rawRows, localStartDate, localEndDate, statusFilter, eventTypeFilter, searchQuery]);

  // 4. Calculate stats summary for the report header
  const reportStats = useMemo(() => {
    const totalCount = filteredRows.length;
    let financialSum = 0;
    
    filteredRows.forEach(row => {
      if (row.amount) financialSum += row.amount;
      else if (row.total_amount) financialSum += row.total_amount;
    });

    return {
      totalCount,
      financialSum
    };
  }, [filteredRows]);

  // 5. Exporters
  const downloadCSV = () => {
    if (filteredRows.length === 0) return;
    const headers = Object.keys(filteredRows[0]);
    const csvRows = [
      headers.join(','), // Header row
      ...filteredRows.map(row => 
        headers.map(fieldName => {
          const val = row[fieldName];
          return `"${String(val ?? '').replace(/"/g, '""')}"`;
         }).join(',')
      )
    ];
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join('\r\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Photocrew_Pictures_Report_${cardName.replace(/\s+/g, '_')}_${currentRange.start}_to_${currentRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = () => {
    if (filteredRows.length === 0) return;
    try {
      const headers = Object.keys(filteredRows[0]);
      const worksheetData = filteredRows.map(row => {
        const obj: { [key: string]: any } = {};
        headers.forEach(h => {
          const cleanHeading = h.replace(/_/g, ' ').toUpperCase();
          obj[cleanHeading] = row[h];
        });
        return obj;
      });

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Report Data");
      
      // Auto-size columns slightly
      const maxColLengths = headers.map(h => {
        const hLen = h.length;
        const vals = filteredRows.map(row => String(row[h] ?? '').length);
        return Math.max(hLen, ...vals, 10);
      });
      worksheet['!cols'] = maxColLengths.map(l => ({ wch: l + 2 }));

      XLSX.writeFile(workbook, `Photocrew_Pictures_Report_${cardName.replace(/\s+/g, '_')}_${currentRange.start}_to_${currentRange.end}.xlsx`);
    } catch (err) {
      console.error("XLSX output error", err);
    }
  };

  const downloadPDF = () => {
    if (filteredRows.length === 0) return;
    const doc = new jsPDF();
    
    // Header block
    // Draw charcoal background top frame
    doc.setFillColor(15, 23, 42); // slate-900 / zinc-950
    doc.rect(0, 0, 210, 42, 'F');
    
    // Photocrew Pictures Logo / Brand Symbol
    doc.setTextColor(245, 158, 11); // amber-500
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("PHOTOCREW PICTURES", 14, 18);
    
    doc.setTextColor(156, 163, 175); // zinc-400
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text("CINEMATIC PRODUCTION & OPERATIONS MANAGEMENT SYSTEM", 14, 25);
    
    // Header details (Generated dynamically)
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`REPORT: ${reportTitle.toUpperCase()}`, 115, 15);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`DATE PARAMETERS: ${formatDateDDMMYY(currentRange.start)} to ${formatDateDDMMYY(currentRange.end)}`, 115, 22);
    doc.text(`GENERATED ON: ${formatDateDDMMYY(new Date())}`, 115, 28);
    doc.text(`GENERATED BY: Rupand Das (CEO Command Room)`, 115, 34);
    
    // Divider
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(1.5);
    doc.line(14, 42, 196, 42);
    
    // Add Summary boxes
    doc.setFillColor(243, 244, 246); // gray-100
    doc.rect(14, 48, 182, 18, 'F');
    doc.setDrawColor(229, 231, 235); // gray-200
    doc.setLineWidth(0.5);
    doc.rect(14, 48, 182, 18, 'S');
    
    doc.setTextColor(75, 85, 99); // gray-600
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.text("TOTAL RECORD SET ROWS:", 20, 56);
    doc.text("TRANSACTIONAL VALUE / TOTAL LEDGER VOLUME:", 95, 56);
    
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(11);
    doc.text(`${filteredRows.length} items`, 20, 62);
    doc.text(`${reportStats.financialSum > 0 ? 'Rs. ' + reportStats.financialSum.toLocaleString('en-IN') : 'N/A (Logisitical Metric)'}`, 95, 62);
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    
    const headers = Object.keys(filteredRows[0]);
    const maxCols = Math.min(headers.length, 6); // limit columns visually to fit printable width safely
    const colsToRender = headers.slice(0, maxCols);
    const colWidth = 182 / maxCols;
    
    let y = 78;
    
    // Render column headers
    doc.setFillColor(219, 234, 254); // blue-100
    doc.rect(14, y, 182, 8, 'F');
    doc.setDrawColor(191, 219, 254);
    doc.rect(14, y, 182, 8, 'S');
    
    doc.setTextColor(30, 58, 138); // blue-900
    colsToRender.forEach((h, idx) => {
      const displayHeader = h.replace(/_/g, ' ').toUpperCase();
      doc.text(displayHeader, 16 + idx * colWidth, y + 6);
    });
    
    y += 8;
    doc.setTextColor(55, 65, 81); // gray-700
    
    filteredRows.forEach((row, rowIdx) => {
      // Check for page overflow
      if (y > 275) {
        doc.addPage();
        y = 20;
        
        // draw repeating soft page header
        doc.setFillColor(15, 23, 42);
        doc.rect(14, y, 182, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`Photocrew Pictures - Secure Analytical Logs (Continued) - Scope: ${currentRange.start} / ${currentRange.end}`, 18, y + 6.5);
        
        y += 15;
        doc.setFontSize(8);
      }
      
      // Draw row background alternating
      if (rowIdx % 2 === 1) {
        doc.setFillColor(249, 250, 251); // gray-50
        doc.rect(14, y, 182, 8, 'F');
      }
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      
      colsToRender.forEach((h, colIdx) => {
        let val = row[h];
        if (typeof val === 'number' && (h.toLowerCase().includes('amount') || h.toLowerCase() === 'received' || h.toLowerCase() === 'balance_due' || h.toLowerCase() === 'total_amount')) {
          val = 'Rs. ' + val.toLocaleString('en-IN');
        } else {
          val = String(val ?? '');
        }
        
        const truncated = val.length > 22 ? val.substring(0, 20) + '..' : val;
        doc.text(truncated, 16 + colIdx * colWidth, y + 6);
      });
      
      y += 8;
    });
    
    // Page footer
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text("System Notification: This dossier is private and protected as confidential. Distributed strictly for central CEO auditing.", 14, 290);
    
    doc.save(`Photocrew_Pictures_Report_${cardName.replace(/\s+/g, '_')}_${currentRange.start}_to_${currentRange.end}.pdf`);
  };

  const printReport = () => {
    const printContent = document.getElementById('report-printable-area');
    if (!printContent) return;
    const printWindow = window.open('', '', 'text/html');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>${cardName} Report - Photo Crew ERP</title>
          <style>
            body { font-family: sans-serif; color: #1e293b; padding: 30px; }
            h1 { color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 10px; }
            .meta { margin-bottom: 20px; font-size: 13px; color: #64748b; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #f1f5f9; font-weight: bold; padding: 10px; text-align: left; font-size: 11px; border: 1px solid #cbd5e1; }
            td { padding: 9px; font-size: 11px; border: 1px solid #cbd5e1; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
          </style>
        </head>
        <body>
          <h1>PHOTO CREW ERP - ANALYTICS REPORT</h1>
          <div class="meta">
            <strong>Target Node:</strong> ${cardName} (Sub-module: ${reportType.toUpperCase()})<br/>
            <strong>Temporal Scope:</strong> ${formatDateDDMMYY(currentRange.start)} through ${formatDateDDMMYY(currentRange.end)} (Custom Range)<br/>
            <strong>Total Elements Recorded:</strong> ${filteredRows.length} entries<br/>
            ${reportStats.financialSum > 0 ? `<strong>Financial Liquidity Total:</strong> ₹ ${reportStats.financialSum.toLocaleString('en-IN')}<br/>` : ''}
            <strong>Generation Date:</strong> ${formatDateDDMMYY(new Date())}
          </div>
          ${printContent.innerHTML}
          <div class="footer">
            Confidential operations log generated inside Photo Crew ERP Systems Sandbox.
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl w-full max-w-5xl shadow-2xl relative flex flex-col max-h-[90vh]">
        
        {/* Header bar */}
        <div className="p-4 sm:p-5 border-b border-zinc-850 flex items-center justify-between bg-zinc-950">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono font-black px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {reportType}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-widest">// SECURE REPORT LOGS</span>
            </div>
            <h2 className="text-sm font-sans font-extrabold text-white mt-1">
              {reportTitle}
            </h2>
          </div>
          
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Local Filter Ribbon */}
        <div className="px-4 py-3 border-b border-zinc-850 bg-zinc-950/70 flex flex-wrap gap-4 items-center">
          {/* Start Date */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Start Date</span>
            <div className="w-36">
              <DateFilterInput
                value={localStartDate}
                onChange={setLocalStartDate}
                className="bg-zinc-900 border border-zinc-850 rounded-lg px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-indigo-500 h-8 font-mono"
              />
            </div>
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">End Date</span>
            <div className="w-36">
              <DateFilterInput
                value={localEndDate}
                onChange={setLocalEndDate}
                className="bg-zinc-900 border border-zinc-850 rounded-lg px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-indigo-500 h-8 font-mono"
              />
            </div>
          </div>

          {/* Status Filter */}
          {reportType === 'sales' && (
            <div className="flex flex-col gap-1 min-w-max">
              <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Status Option</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-850 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none focus:border-indigo-500 h-8 font-mono cursor-pointer"
              >
                {uniqueStatuses.map(st => (
                  <option key={st} value={st} className="bg-zinc-950 text-zinc-300">{st}</option>
                ))}
              </select>
            </div>
          )}

          {/* Event Type Filter */}
          {reportType === 'sales' && (
            <div className="flex flex-col gap-1 min-w-max">
              <span className="text-[10px] text-zinc-500 font-mono font-bold uppercase tracking-wider">Event Category</span>
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-850 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none focus:border-indigo-500 h-8 font-mono cursor-pointer"
              >
                {uniqueEventTypes.map(ev => (
                  <option key={ev} value={ev} className="bg-zinc-950 text-zinc-300">{ev}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Toolbar: Search & Exporter Controls */}
        <div className="p-4 border-b border-zinc-850 bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Search */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search detailed items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-850 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-505 font-sans"
            />
          </div>

          {/* Export tools */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={downloadCSV}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase font-mono font-bold rounded-lg border border-indigo-500/10 hover:border-indigo-500/25 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 transition-all disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={downloadExcel}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase font-mono font-bold rounded-lg border border-emerald-500/10 hover:border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 transition-all disabled:opacity-40"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>EXCEL</span>
            </button>
            <button
              onClick={downloadPDF}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase font-mono font-bold rounded-lg border border-red-500/10 hover:border-red-500/25 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all disabled:opacity-40"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <button
              onClick={printReport}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase font-mono font-bold rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-900 text-zinc-300 transition-all disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PRINT</span>
            </button>
          </div>
        </div>

        {/* Dynamic table area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          
          {/* Quick Metrics Header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-zinc-850/30">
            <div className="bg-zinc-900 border border-zinc-850 p-3.5 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase font-mono font-bold text-zinc-550 block">CONSOLIDATED LIST COUNT</span>
                <span className="text-xl font-sans font-black text-white mt-1 block">
                  {filteredRows.length} <span className="text-[11px] text-zinc-500">records</span>
                </span>
              </div>
              <CheckCircle className="w-6 h-6 text-[#10B981] opacity-20" />
            </div>
            
            {reportStats.financialSum > 0 && (
              <div className="bg-zinc-900 border border-zinc-850 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase font-mono font-bold text-zinc-550 block">CUMULATIVE LEDGER VOLUME</span>
                  <span className="text-xl font-mono font-black text-amber-500 mt-1 block">
                    {formatINR(reportStats.financialSum)}
                  </span>
                </div>
                <TrendingUp className="w-6 h-6 text-amber-500 opacity-20" />
              </div>
            )}
          </div>

          <div id="report-printable-area" className="mt-5">
            {filteredRows.length > 0 ? (
              <div className="overflow-x-auto border border-zinc-850 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-850 bg-zinc-900 text-zinc-400 font-mono text-[10px] uppercase tracking-wide">
                      {Object.keys(filteredRows[0]).map((header) => (
                        <th key={header} className="p-3 font-extrabold ">
                          {header.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 text-zinc-300 font-mono text-[11px] ">
                    {filteredRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-zinc-900/40 transition-colors">
                        {Object.keys(row).map((header, cIdx) => {
                          const val = row[header];
                          // Custom styles for specific values
                          let styling = "p-3 font-sans text-zinc-350";
                          if (header.toLowerCase() === 'id' || header.toLowerCase() === 'order_id') {
                            styling = "p-3 font-mono text-zinc-400 font-bold";
                          } else if (header.toLowerCase() === 'name' || header.toLowerCase() === 'customer_name') {
                            styling = "p-3 font-sans font-black text-white text-xs";
                          } else if (header.toLowerCase() === 'status' || header.toLowerCase() === 'editing_status') {
                            const isAlert = val === 'Pending' || val === 'New Lead' || val === 'Revision Required';
                            const isCheck = val === 'Completed' || val === 'Fully Paid' || val === 'Approved' || val === 'Delivered' || val === 'Project Approved' || val === 'Project Delivered';
                            styling = `p-3 font-mono text-[10px] font-bold ${isAlert ? 'text-amber-400' : isCheck ? 'text-emerald-400' : 'text-indigo-400'}`;
                          } else if (header.toLowerCase().includes('amount') || header.toLowerCase() === 'received' || header.toLowerCase() === 'balance_due' || header.toLowerCase() === 'total_amount') {
                            styling = `p-3 font-mono font-bold ${val > 0 && header.toLowerCase() === 'balance_due' ? 'text-rose-400' : 'text-zinc-200'}`;
                          }
                          return (
                            <td key={cIdx} className={styling}>
                              {typeof val === 'number' && (header.toLowerCase().includes('amount') || header.toLowerCase() === 'received' || header.toLowerCase() === 'balance_due' || header.toLowerCase() === 'total_amount')
                                ? formatINR(val)
                                : String(val ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div id="no_data_message" className="py-12 text-center text-zinc-550 border border-dashed border-zinc-850 rounded-xl space-y-2">
                <AlertTriangle className="w-8 h-8 text-amber-500/40 mx-auto animate-pulse" />
                <p className="font-sans text-sm font-semibold text-zinc-400">
                  No records found for selected date range.
                </p>
                <p className="font-mono text-[9px] text-zinc-650">
                  REF_CODE: SIG_ZERO_ROWSET // Temporal index constraints active
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
