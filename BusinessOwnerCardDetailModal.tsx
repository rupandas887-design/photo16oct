import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Calendar, Info, Download, FileSpreadsheet } from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { formatINR, formatDateDDMMYY } from '../utils';
import { compareRecordsByDate } from './ui/ListSortFilter';

interface ColumnDefinition {
  key: string;
  label: string;
  render?: (item: any) => React.ReactNode;
}

interface BusinessOwnerCardDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accentColor?: 'emerald' | 'blue' | 'amber' | 'rose' | 'purple' | 'pink';
  data: any[];
  columns: ColumnDefinition[];
  totalLabel?: string;
  totalValue?: React.ReactNode;
  filterDescription?: string;
  onDownloadPDF?: (records: any[]) => void;
  onDownloadExcel?: (records: any[]) => void;
  onDownloadCSV?: (records: any[]) => void;
}

export const BusinessOwnerCardDetailModal: React.FC<BusinessOwnerCardDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  accentColor = 'amber',
  data,
  columns,
  totalLabel = 'Total Value',
  totalValue,
  filterDescription,
  onDownloadPDF,
  onDownloadExcel,
  onDownloadCSV
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Search filter inside the modal for ease of review
  const filteredData = useMemo(() => {
    let list = data || [];
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      list = list.filter(item => {
        return Object.values(item).some(val => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(lowerSearch);
        });
      });
    }
    return [...list].sort((a, b) => compareRecordsByDate(a, b, 'latest'));
  }, [data, searchTerm]);

  // Download handlers for the displayed/filtered records
  const handleDownloadPDF = () => {
    if (onDownloadPDF) {
      onDownloadPDF(filteredData);
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text(`${title || 'Detail Report'}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${formatDateDDMMYY(new Date())} | Period: ${subtitle || 'All'} | Displayed Records: ${filteredData.length}`, 14, 22);

    if (totalLabel && totalValue) {
      doc.setFontSize(11);
      doc.text(`${totalLabel}: ${typeof totalValue === 'string' || typeof totalValue === 'number' ? totalValue : ''}`, 14, 30);
    }

    let y = 38;
    doc.setFontSize(9);
    doc.setTextColor(100);

    const printableCols = columns.filter(c => c.key !== 'actions' && c.label.toLowerCase() !== 'action');
    let x = 14;
    const colWidth = Math.max(25, Math.floor(260 / (printableCols.length || 1)));
    printableCols.forEach((c) => {
      doc.text(c.label.substring(0, 18), x, y);
      x += colWidth;
    });

    y += 3;
    doc.line(14, y, 280, y);
    y += 6;

    doc.setTextColor(0);
    filteredData.forEach((row) => {
      if (y > 185) {
        doc.addPage();
        y = 20;
      }
      x = 14;
      printableCols.forEach((c) => {
        let val = row[c.key];
        if (typeof val === 'number' && (c.key.toLowerCase().includes('revenue') || c.key.toLowerCase().includes('received') || c.key.toLowerCase().includes('outstanding') || c.key.toLowerCase().includes('amount') || c.key.toLowerCase().includes('balance'))) {
          val = `Rs.${val.toLocaleString('en-IN')}`;
        } else if (val === null || val === undefined) {
          val = '-';
        }
        doc.text(String(val).substring(0, 18), x, y);
        x += colWidth;
      });
      y += 6;
    });

    const cleanTitle = (title || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`${cleanTitle}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadExcel = () => {
    if (onDownloadExcel) {
      onDownloadExcel(filteredData);
      return;
    }
    const printableCols = columns.filter(c => c.key !== 'actions' && c.label.toLowerCase() !== 'action');
    const excelData = filteredData.map(row => {
      const formattedRow: Record<string, any> = {};
      printableCols.forEach(c => {
        let val = row[c.key];
        if (val === null || val === undefined) val = '';
        formattedRow[c.label] = val;
      });
      return formattedRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Report');
    const cleanTitle = (title || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(workbook, `${cleanTitle}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadCSV = () => {
    if (onDownloadCSV) {
      onDownloadCSV(filteredData);
      return;
    }
    const printableCols = columns.filter(c => c.key !== 'actions' && c.label.toLowerCase() !== 'action');
    const headers = printableCols.map(c => `"${c.label.replace(/"/g, '""')}"`);
    const rows = filteredData.map(row => {
      return printableCols.map(c => {
        let val = row[c.key];
        if (val === null || val === undefined) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const cleanTitle = (title || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute("download", `${cleanTitle}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.minHeight = '';
      document.body.style.position = '';
      document.body.style.padding = '';
      document.body.style.margin = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.documentElement.style.minHeight = '';
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  // Determine colors based on accent type
  const colorMap: Record<string, { border: string; bg: string; text: string; badge: string; dot: string }> = {
    emerald: {
      border: 'border-emerald-500/30',
      bg: 'from-emerald-950/20 to-zinc-950',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      dot: 'bg-emerald-500'
    },
    blue: {
      border: 'border-blue-500/30',
      bg: 'from-blue-950/20 to-zinc-950',
      text: 'text-blue-400',
      badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      dot: 'bg-blue-500'
    },
    amber: {
      border: 'border-amber-500/30',
      bg: 'from-amber-950/20 to-zinc-950',
      text: 'text-amber-400',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      dot: 'bg-amber-500'
    },
    rose: {
      border: 'border-rose-500/30',
      bg: 'from-rose-950/20 to-zinc-950',
      text: 'text-rose-400',
      badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      dot: 'bg-rose-500'
    },
    purple: {
      border: 'border-purple-500/30',
      bg: 'from-purple-950/20 to-zinc-950',
      text: 'text-purple-400',
      badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      dot: 'bg-purple-500'
    },
    pink: {
      border: 'border-pink-500/30',
      bg: 'from-pink-950/20 to-zinc-950',
      text: 'text-pink-400',
      badge: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
      dot: 'bg-pink-500'
    }
  };

  const activeColors = (accentColor && colorMap[accentColor]) || colorMap.amber;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/85 z-[150] flex items-center justify-center p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={`bg-zinc-950 border ${activeColors.border} rounded-2xl w-full max-w-5xl 2xl:max-w-7xl min-[1920px]:max-w-[1600px] min-[2560px]:max-w-[2000px] min-[3840px]:max-w-[2800px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-900 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${activeColors.dot}`} />
              <h2 className="text-base font-black uppercase tracking-wider text-white font-mono">
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="text-xs text-zinc-400 flex items-center gap-1.5 font-sans">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span>{subtitle}</span>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info & Metrics Bar */}
        <div className="px-6 py-4 bg-zinc-900/40 border-b border-zinc-900/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Card Value representation */}
            <div className="px-4 py-2 bg-zinc-950 border border-zinc-850 rounded-xl flex items-center gap-3 shadow-inner">
              <span className="text-xs font-mono text-zinc-400">{totalLabel}:</span>
              <span className={`text-sm sm:text-base font-black font-mono ${activeColors.text}`}>
                {totalValue}
              </span>
            </div>

            {/* Record count representation */}
            <div className="px-4 py-2 bg-zinc-950 border border-zinc-850 rounded-xl flex items-center gap-3 shadow-inner">
              <span className="text-xs font-mono text-zinc-400">Records Count:</span>
              <span className="text-sm sm:text-base font-black font-mono text-zinc-200">
                {filteredData.length} {filteredData.length === 1 ? 'Record' : 'Records'}
                {searchTerm.trim() && data.length !== filteredData.length && (
                  <span className="text-[10px] text-zinc-500 font-normal ml-1">of {data.length}</span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search inside popup */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8.5 pr-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            {/* DOWNLOAD REPORT BUTTONS - ALWAYS VISIBLE */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 p-1 rounded-xl shadow-sm">
              <div className="flex items-center gap-1.5 px-2 text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Download:</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Download PDF report for current records"
              >
                <Download className="w-3.5 h-3.5 text-rose-400" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadExcel}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Download Excel (.xlsx) report for current records"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadCSV}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 hover:border-zinc-700 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Download CSV report for current records"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content Table Container */}
        <div className="flex-1 overflow-y-auto p-6">
          {filterDescription && (
            <div className="mb-4 p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex items-start gap-2.5 text-xs text-zinc-400">
              <Info className={`w-4 h-4 ${activeColors.text} mt-0.5 flex-shrink-0`} />
              <span>{filterDescription}</span>
            </div>
          )}

          {filteredData.length === 0 ? (
            <div className="py-12 text-center space-y-2 border border-dashed border-zinc-850 rounded-2xl">
              <p className="text-sm text-zinc-400 font-bold">No records found</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                There are no matching items for the current active filters or search terms.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table View */}
              <div className="border border-zinc-900 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-zinc-950/80 border-b border-zinc-900 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                        {columns.map(col => (
                          <th key={col.key} className="py-3 px-4 font-bold">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900 bg-zinc-950/20 text-xs">
                      {filteredData.map((item, idx) => (
                        <tr 
                          key={item.id || item.order_id || item.lead_id || idx} 
                          className="hover:bg-zinc-900/40 transition-colors"
                        >
                          {columns.map(col => (
                            <td key={col.key} className="py-3 px-4 text-zinc-300 font-sans">
                              {col.render ? col.render(item) : String(item[col.key] || 'N/A')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 font-mono transition-colors cursor-pointer"
          >
            Close Detail View
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
