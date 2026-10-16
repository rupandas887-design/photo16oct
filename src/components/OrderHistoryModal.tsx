import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  History, Calendar, Clock, User, CheckCircle2, CheckCircle, DollarSign, 
  Film, FileText, ExternalLink, Eye, X, Search, Filter, ArrowDownUp, 
  ShieldCheck, Image as ImageIcon, Link as LinkIcon, AlertCircle, Play, 
  Send, RefreshCw, ChevronRight, Layers, FileVideo, Download, ChevronDown,
  Package, MapPin, Phone, Mail, Tag, Award, Sparkles, Check, HardDrive
} from 'lucide-react';
import { useRole } from './RoleContext';
import { formatINR, resolveStorageUrl, formatDateDDMMYY, formatTime12Hour, formatISTDate, formatISTTime12Hour } from '../utils';

export interface OrderHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any; // Order, Lead, or summary table item
}

interface ProofItem {
  id: string;
  label: string;
  taskName: string;
  staffName: string;
  department: 'Sales' | 'Operations' | 'Production' | 'Client Consent' | 'Payment' | 'System';
  uploadDate: string;
  uploadTime?: string;
  url: string;
  type: 'image' | 'link' | 'file';
}

interface HistoryTimelineItem {
  id: string;
  timestamp: string; // ISO date string for sorting
  formattedDate: string;
  formattedTime: string;
  activity: string;
  category: 'Sales' | 'Operations' | 'Production' | 'Client Consent' | 'Payment' | 'System';
  status: string;
  statusColor: string;
  staffName: string;
  staffRole?: string;
  description: string;
  proofs: ProofItem[];
}

export const OrderHistoryModal: React.FC<OrderHistoryModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const { 
    leads = [], 
    orders = [], 
    quotations = [],
    production = [], 
    operations = [], 
    staffAssignments = [],
    editorAssignments = [], 
    payments = [], 
    statusHistory = [], 
    logs = [],
    rawFootage = [],
    clientAcceptanceVerifications = [],
    equipmentHandovers = [],
    leadEquipmentHistory = []
  } = useRole();

  const [activeTab, setActiveTab] = useState<'roadmap' | 'operations' | 'production' | 'proofs' | 'footage' | 'payments'>('roadmap');
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('asc'); // Default chronological (oldest to newest)
  const [previewImage, setPreviewImage] = useState<{
    url: string;
    title: string;
    taskName?: string;
    staffName?: string;
    department?: string;
    uploadDate?: string;
  } | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !(prev[section] ?? true) }));
  };

  // 1. Identify Target Lead / Order IDs
  const targetOrderId = order?.order_id || order?.orderId || order?.rawOrder?.order_id || '';
  const targetLeadId = order?.lead_id || order?.leadId || order?.rawLead?.lead_id || order?.rawOrder?.lead_id || '';

  const matchedOrder = useMemo(() => {
    if (!targetOrderId && !targetLeadId) return order;
    return (orders || []).find(o => 
      (targetOrderId && o.order_id === targetOrderId) || 
      (targetLeadId && o.lead_id === targetLeadId)
    ) || order;
  }, [orders, targetOrderId, targetLeadId, order]);

  const matchedLead = useMemo(() => {
    const leadId = targetLeadId || matchedOrder?.lead_id;
    if (!leadId) return null;
    return (leads || []).find(l => l.lead_id === leadId || l.lead_id === targetOrderId) || null;
  }, [leads, targetLeadId, matchedOrder, targetOrderId]);

  const primaryOrderId = matchedOrder?.order_id || targetOrderId || '';
  const primaryLeadId = matchedLead?.lead_id || targetLeadId || matchedOrder?.lead_id || '';

  // 2. Filter Sub-collections safely
  const matchedOps = useMemo(() => {
    return (operations || []).filter(op => 
      (primaryOrderId && (op.order_id === primaryOrderId || op.event_id === primaryOrderId)) || 
      (primaryLeadId && op.lead_id === primaryLeadId)
    );
  }, [operations, primaryOrderId, primaryLeadId]);

  const matchedStaffAssignments = useMemo(() => {
    return (staffAssignments || []).filter(sa => 
      (primaryOrderId && sa.order_id === primaryOrderId) || 
      (primaryLeadId && (sa.order_id === primaryLeadId || sa.lead_id === primaryLeadId))
    );
  }, [staffAssignments, primaryOrderId, primaryLeadId]);

  const matchedProd = useMemo(() => {
    return (production || []).find(p => 
      (primaryOrderId && (p.order_id === primaryOrderId || p.tracking_id === primaryOrderId || p.production_id === primaryOrderId)) || 
      (primaryLeadId && (p.lead_id === primaryLeadId || p.tracking_id === primaryLeadId))
    ) || null;
  }, [production, primaryOrderId, primaryLeadId]);

  const matchedEditorAssignments = useMemo(() => {
    const prodId = matchedProd?.production_id;
    return (editorAssignments || []).filter(ea => 
      (primaryOrderId && (ea.order_id === primaryOrderId || ea.production_id === primaryOrderId)) || 
      (prodId && ea.production_id === prodId) ||
      (primaryLeadId && ea.order_id === primaryLeadId)
    );
  }, [editorAssignments, primaryOrderId, primaryLeadId, matchedProd]);

  const matchedRawFootage = useMemo(() => {
    return (rawFootage || []).filter(rf => 
      (primaryOrderId && (rf.order_id === primaryOrderId || rf.tracking_id === primaryOrderId)) || 
      (primaryLeadId && rf.tracking_id === primaryLeadId)
    );
  }, [rawFootage, primaryOrderId, primaryLeadId]);

  const matchedPayments = useMemo(() => {
    return (payments || []).filter(p => 
      (primaryOrderId && p.order_id === primaryOrderId) || 
      (primaryLeadId && p.lead_id === primaryLeadId)
    );
  }, [payments, primaryOrderId, primaryLeadId]);

  const matchedStatusHistory = useMemo(() => {
    return (statusHistory || []).filter(sh => 
      (primaryOrderId && sh.order_id === primaryOrderId) || 
      (primaryLeadId && sh.lead_id === primaryLeadId)
    );
  }, [statusHistory, primaryOrderId, primaryLeadId]);

  const matchedLogs = useMemo(() => {
    return (logs || []).filter(log => 
      (primaryOrderId && (log.record_id === primaryOrderId || log.order_id === primaryOrderId || (log.details && log.details.includes(primaryOrderId)))) || 
      (primaryLeadId && (log.record_id === primaryLeadId || log.lead_id === primaryLeadId || (log.details && log.details.includes(primaryLeadId))))
    );
  }, [logs, primaryOrderId, primaryLeadId]);

  const matchedClientVerifications = useMemo(() => {
    return (clientAcceptanceVerifications || []).filter(cav => 
      (primaryOrderId && cav.order_id === primaryOrderId) || 
      (primaryLeadId && cav.order_id === primaryLeadId)
    );
  }, [clientAcceptanceVerifications, primaryOrderId, primaryLeadId]);

  const matchedQuotations = useMemo(() => {
    return (quotations || []).filter(q => 
      (primaryLeadId && q.lead_id === primaryLeadId) || 
      (primaryOrderId && q.order_id === primaryOrderId)
    );
  }, [quotations, primaryLeadId, primaryOrderId]);

  const operationsImageHistory = useMemo(() => {
    // 1. Group staff assignments by Event ID/Name
    const eventsMap: Record<string, {
      event_id: string;
      event_name: string;
      staff: {
        assignment_id: string;
        staff_id: string;
        staff_name: string;
        staff_role: string;
        task_status: string;
        assignment_status: string;
        assignment_date: string;
        equipment: string[];
        mobile: string;
        raw_footage_link: string;
        eventStartImages: any[];
        equipmentReceivedImages: { equipmentName: string; images: any[] }[];
        equipmentHandoverImages: { equipmentName: string; images: any[] }[];
        eventEndImages: any[];
      }[];
    }> = {};

    matchedStaffAssignments.forEach(sa => {
      const eId = sa.event_id || 'general';
      const eName = sa.event_name || 'General Event';
      const key = `${eId}_${eName}`;

      if (!eventsMap[key]) {
        eventsMap[key] = {
          event_id: eId,
          event_name: eName,
          staff: []
        };
      }

      // Find all leadEquipmentHistory records matching this staff and event
      const normStaffName = (sa.staff_name || '').trim().toLowerCase();
      const saStaffId = sa.staff_id || '';
      const saEventId = sa.event_id;
      const saEventName = (sa.event_name || '').trim().toLowerCase();

      const matchedHistory = (leadEquipmentHistory || []).filter(h => {
        // Must belong to the current order/lead
        const isOrderMatch = (primaryOrderId && h.order_id === primaryOrderId) || 
                             (primaryLeadId && h.lead_id === primaryLeadId);
        if (!isOrderMatch) return false;

        // Staff match
        const recordStaff = (h.returned_by || '').trim().toLowerCase();
        let parsedRemarks: any = {};
        if (h.remarks) {
          try {
            if (typeof h.remarks === 'string' && h.remarks.startsWith('{')) {
              parsedRemarks = JSON.parse(h.remarks);
            } else if (typeof h.remarks === 'object') {
              parsedRemarks = h.remarks;
            }
          } catch (e) {}
        }
        const parsedStaffName = (parsedRemarks.staff_name || parsedRemarks.uploaded_by || '').trim().toLowerCase();
        const parsedStaffId = parsedRemarks.staff_id || '';

        const isStaffMatch = (normStaffName && recordStaff === normStaffName) || 
                             (normStaffName && parsedStaffName === normStaffName) ||
                             (saStaffId && parsedStaffId && saStaffId === parsedStaffId);
        if (!isStaffMatch) return false;

        // Event match
        let isEventMatch = true;
        const hEventId = parsedRemarks.event_id;
        const hEventName = (parsedRemarks.event_name || '').trim().toLowerCase();
        if (saEventId && hEventId && saEventId !== 'gen' && saEventId !== 'ev' && hEventId !== 'gen' && hEventId !== 'ev') {
          if (saEventId !== hEventId) {
            isEventMatch = false;
            if (saEventName && hEventName && saEventName === hEventName) {
              isEventMatch = true;
            }
          }
        }

        return isEventMatch;
      });

      // Prepare categories
      const saEquipment = Array.isArray(sa.equipment) ? sa.equipment : (sa.equipment ? [sa.equipment] : []);

      const equipmentReceivedImages: { equipmentName: string; images: any[] }[] = saEquipment.map(eq => ({
        equipmentName: eq,
        images: []
      }));

      const equipmentHandoverImages: { equipmentName: string; images: any[] }[] = saEquipment.map(eq => ({
        equipmentName: eq,
        images: []
      }));

      const eventStartImages: any[] = [];
      const eventEndImages: any[] = [];

      matchedHistory.forEach(h => {
        let photoUrl = h.photo_url || '';
        let metaDate = '-';
        let metaTime = '-';

        let parsedRemarks: any = {};
        if (h.remarks) {
          try {
            if (typeof h.remarks === 'string' && h.remarks.startsWith('{')) {
              parsedRemarks = JSON.parse(h.remarks);
            } else if (typeof h.remarks === 'object') {
              parsedRemarks = h.remarks;
            }
            photoUrl = parsedRemarks.photo_url || parsedRemarks.url || photoUrl;
          } catch (e) {}
        }

        if (!photoUrl) return;

        photoUrl = resolveStorageUrl(photoUrl);

        const timestamp = h.returned_at || h.created_at || parsedRemarks.uploaded_at;
        if (timestamp) {
          const dt = new Date(timestamp);
          if (!isNaN(dt.getTime())) {
            metaDate = formatISTDate(timestamp);
            metaTime = formatISTTime12Hour(timestamp);
          }
        }

        const eqName = h.equipment_name || '';
        const eqStatus = (h.equipment_status || parsedRemarks.proof_type || '').toLowerCase().trim();
        const eqNameLower = eqName.toLowerCase();

        // 1. EVENT START
        if (eqNameLower === 'event start photo proof' || eqNameLower === 'event start' || eqNameLower === 'event start image' || eqStatus === 'event started' || eqStatus === 'event start') {
          eventStartImages.push({
            id: h.id || `es-${Date.now()}-${Math.random()}`,
            url: photoUrl,
            label: `Event Start Proof - ${sa.staff_name}`,
            uploadDate: metaDate,
            uploadTime: metaTime
          });
        }
        // 2. EVENT END
        else if (eqNameLower === 'event completion photo proof' || eqNameLower === 'event completion' || eqStatus.includes('event complete') || eqStatus.includes('event ended') || eqStatus.includes('event end')) {
          eventEndImages.push({
            id: h.id || `ee-${Date.now()}-${Math.random()}`,
            url: photoUrl,
            label: `Event End Proof - ${sa.staff_name}`,
            uploadDate: metaDate,
            uploadTime: metaTime
          });
        }
        // 3. EQUIPMENT RECEIVED
        else if (eqNameLower === 'asset collection photo proof' || eqNameLower === 'asset collection' || eqNameLower === 'equipment received / asset picture' || eqStatus === 'equipment received' || eqStatus === 'asset collected (draft)') {
          const label = eqNameLower.includes('proof') ? 'Asset Collection Proof' : eqName;
          const matchedEq = equipmentReceivedImages.find(item => eqNameLower.includes(item.equipmentName.toLowerCase()) || item.equipmentName.toLowerCase().includes(eqNameLower));
          if (matchedEq) {
            matchedEq.images.push({
              id: h.id || `er-${Date.now()}-${Math.random()}`,
              url: photoUrl,
              label: `${label} - ${sa.staff_name}`,
              equipmentName: matchedEq.equipmentName,
              uploadDate: metaDate,
              uploadTime: metaTime
            });
          } else {
            if (equipmentReceivedImages.length > 0) {
              equipmentReceivedImages[0].images.push({
                id: h.id || `er-${Date.now()}-${Math.random()}`,
                url: photoUrl,
                label: `${label} - ${sa.staff_name}`,
                equipmentName: equipmentReceivedImages[0].equipmentName,
                uploadDate: metaDate,
                uploadTime: metaTime
              });
            } else {
              equipmentReceivedImages.push({
                equipmentName: eqName || 'Assigned Equipment',
                images: [{
                  id: h.id || `er-${Date.now()}-${Math.random()}`,
                  url: photoUrl,
                  label: `${label} - ${sa.staff_name}`,
                  equipmentName: eqName || 'Assigned Equipment',
                  uploadDate: metaDate,
                  uploadTime: metaTime
                }]
              });
            }
          }
        }
        // 4. EQUIPMENT HANDOVER
        else if (eqNameLower === 'equipment handover photo proof' || eqNameLower === 'equipment handover' || eqNameLower === 'asset return photo proof' || eqStatus.includes('handover') || eqStatus.includes('returned')) {
          const label = eqNameLower.includes('proof') ? 'Asset Return Proof' : eqName;
          const matchedEq = equipmentHandoverImages.find(item => eqNameLower.includes(item.equipmentName.toLowerCase()) || item.equipmentName.toLowerCase().includes(eqNameLower));
          if (matchedEq) {
            matchedEq.images.push({
              id: h.id || `eh-${Date.now()}-${Math.random()}`,
              url: photoUrl,
              label: `${label} - ${sa.staff_name}`,
              equipmentName: matchedEq.equipmentName,
              uploadDate: metaDate,
              uploadTime: metaTime
            });
          } else {
            if (equipmentHandoverImages.length > 0) {
              equipmentHandoverImages[0].images.push({
                id: h.id || `eh-${Date.now()}-${Math.random()}`,
                url: photoUrl,
                label: `${label} - ${sa.staff_name}`,
                equipmentName: equipmentHandoverImages[0].equipmentName,
                uploadDate: metaDate,
                uploadTime: metaTime
              });
            } else {
              equipmentHandoverImages.push({
                equipmentName: eqName || 'Assigned Equipment',
                images: [{
                  id: h.id || `eh-${Date.now()}-${Math.random()}`,
                  url: photoUrl,
                  label: `${label} - ${sa.staff_name}`,
                  equipmentName: eqName || 'Assigned Equipment',
                  uploadDate: metaDate,
                  uploadTime: metaTime
                }]
              });
            }
          }
        }
        // 5. OTHER/FALLBACK
        else {
          const isReceivedStatus = eqStatus.includes('received') || eqStatus.includes('collect');
          const isHandoverStatus = eqStatus.includes('handover') || eqStatus.includes('return');
          
          if (isReceivedStatus) {
            const matchedEq = equipmentReceivedImages.find(item => eqNameLower.includes(item.equipmentName.toLowerCase()) || item.equipmentName.toLowerCase().includes(eqNameLower));
            const targetEq = matchedEq || equipmentReceivedImages[0];
            if (targetEq) {
              targetEq.images.push({
                id: h.id || `er-${Date.now()}-${Math.random()}`,
                url: photoUrl,
                label: `${eqName || 'Equipment Received'} - ${sa.staff_name}`,
                equipmentName: targetEq.equipmentName,
                uploadDate: metaDate,
                uploadTime: metaTime
              });
            }
          } else if (isHandoverStatus) {
            const matchedEq = equipmentHandoverImages.find(item => eqNameLower.includes(item.equipmentName.toLowerCase()) || item.equipmentName.toLowerCase().includes(eqNameLower));
            const targetEq = matchedEq || equipmentHandoverImages[0];
            if (targetEq) {
              targetEq.images.push({
                id: h.id || `eh-${Date.now()}-${Math.random()}`,
                url: photoUrl,
                label: `${eqName || 'Equipment Returned'} - ${sa.staff_name}`,
                equipmentName: targetEq.equipmentName,
                uploadDate: metaDate,
                uploadTime: metaTime
              });
            }
          }
        }
      });

      eventsMap[key].staff.push({
        assignment_id: sa.assignment_id,
        staff_id: sa.staff_id,
        staff_name: sa.staff_name,
        staff_role: sa.staff_role,
        task_status: sa.task_status,
        assignment_status: sa.assignment_status,
        assignment_date: sa.assignment_date,
        equipment: saEquipment,
        mobile: sa.mobile || '',
        raw_footage_link: sa.raw_footage_link || '',
        eventStartImages,
        equipmentReceivedImages,
        equipmentHandoverImages,
        eventEndImages
      });
    });

    return Object.values(eventsMap);
  }, [matchedStaffAssignments, leadEquipmentHistory, primaryOrderId, primaryLeadId]);

  // Helper date parser
  const parseDateTime = (dateVal?: any) => {
    if (!dateVal) {
      return { iso: new Date(0).toISOString(), date: 'N/A', time: 'N/A' };
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) {
      return { iso: String(dateVal), date: String(dateVal), time: '' };
    }
    return {
      iso: d.toISOString(),
      date: formatDateDDMMYY(d),
      time: formatTime12Hour(d)
    };
  };

  const categorizeUrl = (url: string): 'image' | 'link' | 'file' => {
    if (!url) return 'file';
    const u = url.toLowerCase();
    if (u.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?.*)?$/i.test(u) || u.includes('/storage/v1/object/public/img/')) {
      return 'image';
    }
    if (u.includes('drive.google.com') || u.includes('docs.google.com') || u.startsWith('http://') || u.startsWith('https://')) {
      return 'link';
    }
    return 'file';
  };

  // 3. Build Unified Chronological Roadmap Timeline
  const timelineItems = useMemo<HistoryTimelineItem[]>(() => {
    if (!isOpen) return [];
    const list: HistoryTimelineItem[] = [];

    // Stage 1: Lead Registration / Quotation Created
    const leadCreated = matchedLead?.created_at || matchedLead?.created_date || matchedOrder?.created_at;
    if (leadCreated) {
      const ts = parseDateTime(leadCreated);
      list.push({
        id: `event_lead_created_${primaryLeadId || primaryOrderId}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: 'Create Quotation & Lead Registration',
        category: 'Sales',
        status: 'Lead Initiated',
        statusColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        staffName: matchedLead?.sales_person || matchedLead?.sales_staff_name || matchedOrder?.sales_person || 'Sales Representative',
        staffRole: 'Sales Team',
        description: `Lead registered for customer ${matchedLead?.customer_name || matchedOrder?.customer_name || 'Client'}. Event: ${matchedLead?.custom_event_name || matchedLead?.event_type || matchedOrder?.event_type || 'Event Coverage'}. Proposed Budget: ${formatINR(matchedLead?.budget || matchedOrder?.quotation_amount || 0)}.`,
        proofs: []
      });
    }

    // Stage 2: Quotations Record
    matchedQuotations.forEach((q, idx) => {
      const ts = parseDateTime(q.created_at || q.date);
      list.push({
        id: `quotation_${q.quotation_id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: 'Quotation Sent & Package Finalized',
        category: 'Sales',
        status: q.status || 'Quotation Sent',
        statusColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        staffName: q.created_by || matchedLead?.sales_person || 'Sales Desk',
        staffRole: 'Sales Executive',
        description: `Quotation issued for ${formatINR(q.final_package_amount || q.total_amount || 0)}. Inclusions/Deliverables: ${q.deliverables_description || q.package_name || 'Package Details'}.`,
        proofs: []
      });
    });

    // Stage 3: Order Confirmed
    if (matchedOrder?.created_at || matchedLead?.booking_date) {
      const ts = parseDateTime(matchedOrder?.created_at || matchedLead?.booking_date);
      list.push({
        id: `order_confirmed_${primaryOrderId}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: 'Order Confirmed & Booking Locked',
        category: 'Sales',
        status: 'Order Confirmed',
        statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        staffName: matchedOrder?.sales_person || matchedLead?.sales_person || 'Sales Manager',
        staffRole: 'Sales Manager',
        description: `Order ${primaryOrderId} confirmed! Agreed total quotation: ${formatINR(matchedOrder?.quotation_amount || 0)}. Advance Collected: ${formatINR(matchedOrder?.advance_received || 0)}. Balance Remaining: ${formatINR(matchedOrder?.balance_amount || 0)}.`,
        proofs: []
      });
    }

    // Status History Entries
    matchedStatusHistory.forEach((sh, idx) => {
      const ts = parseDateTime(sh.created_at || sh.timestamp);
      const proofs: ProofItem[] = [];
      if (sh.proof_url) {
        const resolved = resolveStorageUrl(sh.proof_url);
        if (resolved) {
          proofs.push({
            id: `sh_proof_${sh.id || idx}`,
            label: `Status Transition Proof (${sh.new_status || 'Stage'})`,
            taskName: `Stage Transition to ${sh.new_status || 'Next Stage'}`,
            staffName: sh.changed_by || 'Staff',
            department: 'System',
            uploadDate: ts.date,
            uploadTime: ts.time,
            url: resolved,
            type: categorizeUrl(resolved)
          });
        }
      }

      list.push({
        id: `sh_${sh.id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: sh.new_status ? `Stage Transition: ${sh.new_status}` : 'Status History Updated',
        category: sh.new_status?.includes('Payment') ? 'Payment' : sh.new_status?.includes('Client') ? 'Client Consent' : 'System',
        status: sh.new_status || sh.old_status || 'Updated',
        statusColor: 'bg-zinc-800 text-zinc-200 border-zinc-700',
        staffName: sh.changed_by || 'System',
        staffRole: sh.changed_by_role || 'Staff',
        description: sh.remarks || `Stage changed from "${sh.old_status || 'Initial'}" to "${sh.new_status}".`,
        proofs
      });
    });

    // Stage 4: Operations & Field Crew Assignments
    matchedOps.forEach((op, idx) => {
      const ts = parseDateTime(op.event_date || matchedOrder?.event_date);
      const proofs: ProofItem[] = [];
      const footageLink = op.Raw_Footage_Drive_Link || op.raw_footage_drive_link || op.Consolidated_Drive_Link || op.consolidated_drive_link;
      if (footageLink) {
        proofs.push({
          id: `op_footage_${op.operation_id || idx}`,
          label: 'Field Raw Footage Drive Link',
          taskName: `Shoot Event: ${op.custom_event_name || op.event_name || 'Event Coverage'}`,
          staffName: [op.photographer_assigned, op.videographer_assigned].filter(Boolean).join(', ') || 'Operations Team',
          department: 'Operations',
          uploadDate: ts.date,
          uploadTime: ts.time,
          url: footageLink,
          type: categorizeUrl(footageLink)
        });
      }

      list.push({
        id: `op_${op.operation_id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: op.reporting_time || ts.time,
        activity: 'Operations & Event Shoot Execution',
        category: 'Operations',
        status: op.event_status || 'Operations Active',
        statusColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        staffName: [op.photographer_assigned, op.videographer_assigned, op.drone_operator_assigned, op.assistant_assigned].filter(Boolean).join(', ') || 'Operations Crew',
        staffRole: 'Field Operations Crew',
        description: `Shoot coverage. Photographers: ${op.photographer_assigned || 'N/A'}, Videographers: ${op.videographer_assigned || 'N/A'}, Drone Operator: ${op.drone_operator_assigned || 'N/A'}. Reporting Time: ${op.reporting_time || 'N/A'}. Remarks: ${op.remarks || op.upload_notes_remarks || 'None'}.`,
        proofs
      });
    });

    // Operations Individual Staff Assignments
    matchedStaffAssignments.forEach((sa, idx) => {
      const ts = parseDateTime(sa.assignment_date || matchedOrder?.event_date);
      const proofs: ProofItem[] = [];
      if (sa.raw_footage_link) {
        proofs.push({
          id: `sa_rf_${sa.assignment_id || idx}`,
          label: `Raw Footage Link (${sa.staff_role || 'Field Crew'})`,
          taskName: sa.staff_role || sa.event_name || 'Field Assignment',
          staffName: sa.staff_name,
          department: 'Operations',
          uploadDate: ts.date,
          uploadTime: ts.time,
          url: sa.raw_footage_link,
          type: categorizeUrl(sa.raw_footage_link)
        });
      }

      list.push({
        id: `sa_task_${sa.assignment_id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: `Operations Task: ${sa.staff_role || 'Crew Assignment'}`,
        category: 'Operations',
        status: sa.task_status || sa.assignment_status || 'Assigned',
        statusColor: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        staffName: sa.staff_name || 'Staff Member',
        staffRole: sa.staff_role || 'Operations Staff',
        description: `Assigned Role: ${sa.staff_role || 'Crew'}. Mobile: ${sa.mobile || 'N/A'}. Equipment: ${Array.isArray(sa.equipment) ? sa.equipment.join(', ') : (sa.equipment || 'Standard Kit')}. Status: ${sa.task_status || sa.assignment_status || 'Active'}.`,
        proofs
      });
    });

    // Stage 5 & 6: Production Tasks & Editor Assignments (INDIVIDUAL TASKS SHOWN SEPARATELY)
    matchedEditorAssignments.forEach((ea, idx) => {
      const ts = parseDateTime(ea.assigned_date || ea.created_at || matchedProd?.created_at);
      const proofs: ProofItem[] = [];

      // Raw footage link
      const rfLink = ea.raw_footage_link || ea.rawFootageLink;
      if (rfLink) {
        proofs.push({
          id: `ea_rf_${ea.assignment_id || idx}`,
          label: `Raw Footage Link (${ea.speciality || 'Task'})`,
          taskName: `Production Task: ${ea.speciality || 'Editing Task'}`,
          staffName: ea.staff_name,
          department: 'Production',
          uploadDate: ts.date,
          uploadTime: ts.time,
          url: rfLink,
          type: categorizeUrl(rfLink)
        });
      }

      // Edited Drive Link
      const edLink = ea.Edited_Drive_Link || ea.edited_drive_link;
      if (edLink) {
        proofs.push({
          id: `ea_ed_${ea.assignment_id || idx}`,
          label: `Edited Drive Link (${ea.speciality || 'Task'})`,
          taskName: `Production Task: ${ea.speciality || 'Editing Task'}`,
          staffName: ea.staff_name,
          department: 'Production',
          uploadDate: ts.date,
          uploadTime: ts.time,
          url: edLink,
          type: categorizeUrl(edLink)
        });
      }

      // Task-Specific Proof Images (strictly associated ONLY with this task)
      const taskProofCandidate = ea.confirmation_proof || ea.customer_communication_proof || ea.client_communication_proof || ea.proof_url || ea.proof_image || ea.uploaded_proof;
      if (taskProofCandidate) {
        const resolved = resolveStorageUrl(taskProofCandidate);
        if (resolved) {
          proofs.push({
            id: `ea_proof_${ea.assignment_id || idx}`,
            label: `Task Proof Image (${ea.speciality || 'Editing'})`,
            taskName: `Production Task: ${ea.speciality || 'Editing Task'}`,
            staffName: ea.staff_name,
            department: 'Production',
            uploadDate: ts.date,
            uploadTime: ts.time,
            url: resolved,
            type: categorizeUrl(resolved)
          });
        }
      }

      list.push({
        id: `ea_task_${ea.assignment_id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: `Production Task: ${ea.speciality || 'Editing Task'}`,
        category: 'Production',
        status: ea.status || 'Editor Assigned',
        statusColor: ['Editing Completed', 'Completed', 'Approved'].includes(ea.status)
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          : 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        staffName: ea.staff_name || 'Editor',
        staffRole: `Production Editor (${ea.speciality || 'Editor'})`,
        description: `Deliverable Task: ${ea.speciality || 'Task'}. Assigned Editor: ${ea.staff_name}. Target Finish Date: ${ea.target_finish_date || 'Standard'}. Task Status: "${ea.status}".`,
        proofs
      });
    });

    // Production Master Record & Client Acceptance
    if (matchedProd) {
      const ts = parseDateTime(matchedProd.updated_at || matchedProd.created_at);
      const proofs: ProofItem[] = [];

      const prodProof = matchedProd.client_communication_proof || matchedProd.customer_communication_proof || matchedProd.proof_url;
      if (prodProof) {
        const resolved = resolveStorageUrl(prodProof);
        if (resolved) {
          proofs.push({
            id: `prod_proof_${matchedProd.production_id}`,
            label: 'Client Communication & Consent Proof',
            taskName: 'Client Consent & Review',
            staffName: matchedProd.editor_assigned || 'Production Team',
            department: 'Client Consent',
            uploadDate: ts.date,
            uploadTime: ts.time,
            url: resolved,
            type: categorizeUrl(resolved)
          });
        }
      }

      if (['Client Acceptance', 'Approved', 'Project Delivered', 'Completed', 'Order Closed', 'Closed'].includes(matchedProd.editing_status || matchedProd.production_status || '')) {
        list.push({
          id: `prod_consent_${matchedProd.production_id}`,
          timestamp: ts.iso,
          formattedDate: ts.date,
          formattedTime: ts.time,
          activity: 'Client Acceptance & Final Delivery Review',
          category: 'Client Consent',
          status: matchedProd.editing_status || 'Client Acceptance',
          statusColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          staffName: matchedProd.editor_assigned || 'Production Staff',
          staffRole: 'Production Desk',
          description: `Client communication and deliverable review completed. Delivery link: ${matchedProd.delivery_link || 'Standard Drive'}. Server Path: ${matchedProd.server_path || 'Server Vault'}. Remarks: ${matchedProd.remarks || 'Client confirmed acceptance.'}`,
          proofs
        });
      }
    }

    // Client Acceptance Verifications
    matchedClientVerifications.forEach((cav, idx) => {
      const ts = parseDateTime(cav.created_at);
      const proofs: ProofItem[] = [];
      if (cav.client_communication_consent_proof) {
        const resolved = resolveStorageUrl(cav.client_communication_consent_proof);
        if (resolved) {
          proofs.push({
            id: `cav_proof_${cav.id || idx}`,
            label: 'Client Consent Document Proof',
            taskName: 'Client Acceptance Verification',
            staffName: 'Production Admin',
            department: 'Client Consent',
            uploadDate: ts.date,
            uploadTime: ts.time,
            url: resolved,
            type: categorizeUrl(resolved)
          });
        }
      }

      list.push({
        id: `cav_${cav.id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: 'Client Communication & Consent Verified',
        category: 'Client Consent',
        status: cav.consent_proof_verified ? 'Verified' : 'Pending Verification',
        statusColor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
        staffName: 'Production Quality Controller',
        staffRole: 'Audit Desk',
        description: `Verified client consent proof for folder "${cav.folder_name || 'Deliverables'}". Upload Link: ${cav.upload_link_path || 'N/A'}. Verification Status: ${cav.consent_proof_verified ? 'Approved & Locked' : 'Pending'}.`,
        proofs
      });
    });

    // Stage 7: Payments History
    matchedPayments.forEach((p, idx) => {
      const ts = parseDateTime(p.payment_date || p.created_at);
      const amount = Number(p.advance_received || p.final_payment_received || p.balance_due || 0);
      const proofs: ProofItem[] = [];

      const pProof = p.receipt_url || p.payment_proof_url || p.payment_proof;
      if (pProof) {
        const resolved = resolveStorageUrl(pProof);
        if (resolved) {
          proofs.push({
            id: `pay_proof_${p.payment_id || idx}`,
            label: `Payment Receipt (${p.payment_type || 'Installment'})`,
            taskName: `Payment Collected: ${formatINR(amount)}`,
            staffName: 'Accounts Desk',
            department: 'Payment',
            uploadDate: ts.date,
            uploadTime: ts.time,
            url: resolved,
            type: categorizeUrl(resolved)
          });
        }
      }

      list.push({
        id: `pay_${p.payment_id || idx}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: `Payment Transaction: ${formatINR(amount)}`,
        category: 'Payment',
        status: p.payment_status || 'Received',
        statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        staffName: 'Finance Accounts',
        staffRole: 'Accounts Specialist',
        description: `Payment Type: ${p.payment_type || 'Installment'}. Payment Mode: ${p.payment_mode || 'Online/Bank'}. Transaction ID: ${p.transaction_id || 'N/A'}. Status: ${p.payment_status}.`,
        proofs
      });
    });

    // Stage 8: Order Close Event
    if (['Closed', 'Order Closed', 'Completed', 'Project Completed'].includes(matchedOrder?.order_status || matchedLead?.current_stage || '')) {
      const ts = parseDateTime(matchedOrder?.updated_at || matchedProd?.updated_at);
      list.push({
        id: `order_close_${primaryOrderId}`,
        timestamp: ts.iso,
        formattedDate: ts.date,
        formattedTime: ts.time,
        activity: 'Order Closed & Archived',
        category: 'System',
        status: 'Order Closed',
        statusColor: 'bg-zinc-800 text-emerald-400 border-emerald-500/30',
        staffName: 'Business Owner',
        staffRole: 'Executive Management',
        description: `Project ${primaryOrderId} fully delivered, payments settled, and order officially closed.`,
        proofs: []
      });
    }

    // Deduplicate by ID
    const uniqueMap = new Map<string, HistoryTimelineItem>();
    list.forEach(item => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    });

    const result = Array.from(uniqueMap.values());
    result.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [
    isOpen,
    matchedOrder, 
    matchedLead, 
    matchedProd, 
    matchedOps, 
    matchedStaffAssignments,
    matchedEditorAssignments, 
    matchedPayments, 
    matchedStatusHistory, 
    matchedQuotations,
    matchedClientVerifications,
    sortOrder,
    primaryOrderId,
    primaryLeadId
  ]);

  // 4. Extract ALL Proof Images into Gallery
  const allProofGallery = useMemo<ProofItem[]>(() => {
    const gallery: ProofItem[] = [];
    timelineItems.forEach(item => {
      if (item.proofs && item.proofs.length > 0) {
        item.proofs.forEach(p => {
          if (p.type === 'image') {
            gallery.push(p);
          }
        });
      }
    });
    return gallery;
  }, [timelineItems]);

  // 5. Search Filtered Timeline
  const filteredTimeline = useMemo(() => {
    return timelineItems.filter(item => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        item.activity.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        item.staffName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.formattedDate.toLowerCase().includes(q)
      );
    });
  }, [timelineItems, searchTerm]);

  // 6. Roadmap Macro Milestones Steps Calculation
  const roadmapSteps = useMemo(() => {
    let stages = [
      { id: 'quotation_created', label: 'Create Quotation' },
      { id: 'quotation_sent', label: 'Quotation Sent' },
      { id: 'order_confirmed', label: 'Order Confirmed' },
      { id: 'operations', label: 'Operations' },
      { id: 'production', label: 'Production' },
      { id: 'staff_assigned', label: 'Staff Assignment' },
      { id: 'task_progress', label: 'Task Progress' },
      { id: 'proof_uploaded', label: 'Proof Uploads' },
      { id: 'order_close', label: 'Order Close' }
    ];

    // Filter out unwanted milestone types as requested by the user
    const unwantedMilestones = [
      'Create Quotation',
      'Quotation Sent',
      'Order Confirmed',
      'Operations',
      'Production',
      'Staff Assignment',
      'Task Progress',
      'Proof Uploads',
      'Order Close'
    ];

    stages = stages.filter(st => !unwantedMilestones.includes(st.label));

    const isClosed = ['Closed', 'Order Closed', 'Completed', 'Project Completed'].includes(matchedOrder?.order_status || matchedOrder?.current_stage || matchedLead?.current_stage || '');
    const isProdActive = matchedProd !== null || matchedEditorAssignments.length > 0;
    const isOpsActive = matchedOps.length > 0 || matchedStaffAssignments.length > 0;
    const isOrderConfirmed = matchedOrder !== null || matchedLead?.booking_status === 'Confirmed';
    const hasProofs = allProofGallery.length > 0;

    return stages.map((st, idx) => {
      let isDone = false;
      let isCurrent = false;
      let stepDate = 'Pending';

      if (st.id === 'quotation_created') {
        isDone = true;
        stepDate = parseDateTime(matchedLead?.created_at || matchedOrder?.created_at).date;
      } else if (st.id === 'quotation_sent') {
        isDone = matchedQuotations.length > 0 || isOrderConfirmed;
        stepDate = matchedQuotations[0] ? parseDateTime(matchedQuotations[0].created_at).date : (isDone ? parseDateTime(matchedLead?.created_at).date : 'Pending');
      } else if (st.id === 'order_confirmed') {
        isDone = isOrderConfirmed;
        stepDate = isDone ? parseDateTime(matchedOrder?.created_at || matchedLead?.booking_date).date : 'Pending';
      } else if (st.id === 'operations') {
        isDone = isOpsActive || isProdActive || isClosed;
        isCurrent = isOpsActive && !isProdActive && !isClosed;
        stepDate = matchedOps[0] ? parseDateTime(matchedOps[0].event_date).date : (isDone ? 'Completed' : 'Pending');
      } else if (st.id === 'production') {
        isDone = isProdActive || isClosed;
        isCurrent = isProdActive && !isClosed;
        stepDate = matchedProd?.editing_start_date ? parseDateTime(matchedProd.editing_start_date).date : (isDone ? 'Completed' : 'Pending');
      } else if (st.id === 'staff_assigned') {
        isDone = matchedEditorAssignments.length > 0 || matchedStaffAssignments.length > 0;
        stepDate = matchedEditorAssignments[0] ? parseDateTime(matchedEditorAssignments[0].assigned_date).date : (isDone ? 'Assigned' : 'Pending');
      } else if (st.id === 'task_progress') {
        isDone = matchedEditorAssignments.some(ea => ['Editing Completed', 'Completed', 'Approved'].includes(ea.status)) || isClosed;
        isCurrent = matchedEditorAssignments.some(ea => ea.status === 'In Progress' || ea.status === 'Editing Started');
        stepDate = isDone ? 'Progress Complete' : (isCurrent ? 'In Progress' : 'Pending');
      } else if (st.id === 'proof_uploaded') {
        isDone = hasProofs;
        stepDate = hasProofs ? `${allProofGallery.length} proofs` : 'Pending';
      } else if (st.id === 'order_close') {
        isDone = isClosed;
        isCurrent = !isClosed && (isProdActive || isOpsActive);
        stepDate = isClosed ? parseDateTime(matchedOrder?.updated_at || matchedProd?.updated_at).date : 'Open';
      }

      return {
        ...st,
        isDone,
        isCurrent,
        stepDate
      };
    });
  }, [
    matchedLead, 
    matchedOrder, 
    matchedQuotations, 
    matchedOps, 
    matchedStaffAssignments, 
    matchedProd, 
    matchedEditorAssignments, 
    allProofGallery, 
    isOpen
  ]);

  if (!isOpen || !order) return null;

  // Financial calculations
  const totalValue = matchedOrder?.quotation_amount || matchedLead?.budget || 0;
  const advancePaid = matchedOrder?.advance_received || 0;
  const balanceOutstanding = Math.max(0, totalValue - advancePaid);

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-[2000000] flex items-center justify-center p-2 sm:p-5 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="business_owner_order_history_modal"
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-6xl 2xl:max-w-7xl min-[1920px]:max-w-[1600px] min-[2560px]:max-w-[2000px] min-[3840px]:max-w-[2800px] shadow-2xl relative flex flex-col max-h-[94vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* HEADER BAR (PINNED) */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 bg-zinc-900/80 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                <History className="w-3 h-3" />
                READ-ONLY BUSINESS AUDIT & ROADMAP
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                Order ID: {primaryOrderId || 'N/A'}
              </span>
              {primaryLeadId && (
                <span className="text-[11px] font-mono text-zinc-400">
                  (Lead ID: {primaryLeadId})
                </span>
              )}
            </div>


          </div>

          {/* Financial Summary Pill & Close Button */}
          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
            <div className="hidden sm:flex items-center gap-3 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 font-mono text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Total Value</span>
                <strong className="text-white font-bold">{formatINR(totalValue)}</strong>
              </div>
              <div className="w-px h-7 bg-zinc-800"></div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Paid</span>
                <strong className="text-emerald-400 font-bold">{formatINR(advancePaid)}</strong>
              </div>
              <div className="w-px h-7 bg-zinc-800"></div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block">Balance</span>
                <strong className={balanceOutstanding > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {formatINR(balanceOutstanding)}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Close Audit Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ROADMAP MACRO MILESTONE STEPPER BAR */}
        {roadmapSteps.length > 0 && (
          <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-850 overflow-x-auto shrink-0 custom-scrollbar">
            <div className="flex items-center justify-between min-w-[850px] gap-2">
              {roadmapSteps.map((step, idx) => {
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center text-center space-y-1 group">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all shadow-md ${
                        step.isDone 
                          ? 'bg-emerald-500 text-black shadow-emerald-500/20' 
                          : step.isCurrent 
                          ? 'bg-amber-500 text-black animate-pulse' 
                          : 'bg-zinc-900 text-zinc-600 border border-zinc-800'
                      }`}>
                        {step.isDone ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                      </div>
                      <span className={`text-[11px] font-bold font-sans whitespace-nowrap ${
                        step.isDone ? 'text-zinc-200' : step.isCurrent ? 'text-amber-400' : 'text-zinc-600'
                      }`}>
                        {step.label}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500 whitespace-nowrap">
                        {step.stepDate}
                      </span>
                    </div>

                    {idx < roadmapSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 min-w-[20px] transition-colors ${
                        step.isDone ? 'bg-emerald-500/60' : 'bg-zinc-850'
                      }`}></div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBTAB NAVIGATION & SEARCH BAR */}
        <div className="p-3 sm:p-4 bg-zinc-900/60 border-b border-zinc-800 flex flex-col lg:flex-row items-center justify-between gap-3 shrink-0">
          
          {/* Subtabs */}
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 w-full lg:w-auto overflow-visible relative z-20">
            <button
              type="button"
              onClick={() => { setActiveTab('roadmap'); setShowMoreTabs(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'roadmap' ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Full Roadmap</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreTabs(!showMoreTabs)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab !== 'roadmap' ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <span>More</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreTabs ? 'rotate-180' : ''}`} />
              </button>
              
              {showMoreTabs && (
                <>
                  <div 
                    className="fixed inset-0 z-[90]" 
                    onClick={() => setShowMoreTabs(false)}
                  />
                  <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-[100] py-1.5 overflow-hidden flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => { setActiveTab('operations'); setShowMoreTabs(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        activeTab === 'operations' ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border-l-2 border-transparent'
                      }`}
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>Operations</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('production'); setShowMoreTabs(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        activeTab === 'production' ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border-l-2 border-transparent'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Production Tasks</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('proofs'); setShowMoreTabs(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        activeTab === 'proofs' ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border-l-2 border-transparent'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Proof Gallery</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('footage'); setShowMoreTabs(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        activeTab === 'footage' ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border-l-2 border-transparent'
                      }`}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Footage Repository</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('payments'); setShowMoreTabs(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
                        activeTab === 'payments' ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border-l-2 border-transparent'
                      }`}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Payments</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search history, staff, task..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono placeholder-zinc-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-zinc-900 cursor-pointer whitespace-nowrap"
            >
              <ArrowDownUp className="w-3 h-3 text-amber-400" />
              <span>{sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}</span>
            </button>
          </div>
        </div>

        {/* SCROLLABLE MAIN CONTENT AREA */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar">

          {/* TAB 1: FULL CHRONOLOGICAL ROADMAP */}
          {activeTab === 'roadmap' && (
            <div className="space-y-4">
              {filteredTimeline.length === 0 ? (
                <div className="py-16 text-center bg-zinc-900/30 border border-zinc-800 border-dashed rounded-2xl space-y-2">
                  <History className="w-10 h-10 text-zinc-700 mx-auto" />
                  <p className="text-zinc-400 font-medium text-sm">No historical log entries match your search query.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-zinc-800 pl-4 sm:pl-6 ml-2 sm:ml-4 space-y-5">
                  {filteredTimeline.map((item) => (
                    <div key={item.id} className="relative group">
                      
                      {/* Timeline Dot */}
                      <div className="absolute -left-[23px] sm:-left-[31px] top-1.5 w-4 h-4 rounded-full bg-zinc-950 border-2 border-amber-400 shadow-md"></div>

                      <div className="bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 rounded-2xl p-4 transition-all space-y-3">
                        
                        {/* Top Bar: Date, Staff, Category Badge & Status */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-850 pb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 text-xs font-mono font-bold">
                              <Calendar className="w-3.5 h-3.5 text-amber-400" />
                              <span>{item.formattedDate}</span>
                              {item.formattedTime && item.formattedTime !== 'N/A' && (
                                <span className="text-zinc-500">• {item.formattedTime}</span>
                              )}
                            </span>

                            <span className="text-xs font-mono text-zinc-400">
                              Dept: <strong className="text-zinc-200">{item.category}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-zinc-400 font-mono">
                              By: <strong className="text-zinc-200">{item.staffName}</strong> {item.staffRole && <span className="text-zinc-500 text-[10px]">({item.staffRole})</span>}
                            </span>

                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold border ${item.statusColor}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <span className="text-amber-400">⚡</span>
                            <span>{item.activity}</span>
                          </h4>
                          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                            {item.description}
                          </p>
                        </div>

                        {/* Attached Proofs in Timeline */}
                        {item.proofs && item.proofs.length > 0 && (
                          <div className="pt-2 border-t border-zinc-850 space-y-2">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>Attached Proofs & Documents ({item.proofs.length})</span>
                            </span>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {item.proofs.map((p) => (
                                <div key={p.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs font-bold text-zinc-200 block truncate" title={p.label}>
                                      {p.label}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 font-mono block">
                                      {p.type === 'image' ? 'Image Attachment' : 'Link / File'}
                                    </span>
                                  </div>

                                  {p.type === 'image' ? (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewImage({
                                        url: p.url,
                                        title: p.label,
                                        taskName: p.taskName,
                                        staffName: p.staffName,
                                        department: p.department,
                                        uploadDate: p.uploadDate
                                      })}
                                      className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer shrink-0"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>View</span>
                                    </button>
                                  ) : (
                                    <a
                                      href={p.url && p.url.startsWith('http') ? p.url : p.url ? `https://${p.url}` : '#'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      referrerPolicy="no-referrer"
                                      className="px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold flex items-center gap-1 cursor-pointer shrink-0"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>Open</span>
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OPERATIONS TASKS BREAKDOWN */}
          {activeTab === 'operations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <Film className="w-4 h-4 text-amber-400" />
                  <span>Operations Field Crew Image Audit ({matchedStaffAssignments.length})</span>
                </h3>
              </div>

              {operationsImageHistory.length === 0 ? (
                <div className="py-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                  <p className="text-zinc-500 text-xs font-mono">No operations event tasks or uploaded images recorded for this project.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {operationsImageHistory.map((evt, eIdx) => (
                    <div key={evt.event_id || eIdx} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
                      {/* Event Header */}
                      <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-amber-500 uppercase font-bold tracking-wider block">EVENT UNIT</span>
                            <h4 className="text-base font-bold text-white uppercase font-mono tracking-wide">
                              {evt.event_name}
                            </h4>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-zinc-900 border border-zinc-800 text-zinc-400">
                          {evt.staff.length} Assigned Crew Member{evt.staff.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Staff List for this Event */}
                      <div className="space-y-4">
                        {evt.staff.map((st, sIdx) => (
                          <div key={st.assignment_id || sIdx} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 space-y-4">
                            {/* Staff Profile Row */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-850 pb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300 font-mono text-sm uppercase">
                                  {st.staff_name ? st.staff_name.slice(0, 2) : 'OP'}
                                </div>
                                <div>
                                  <h5 className="text-sm font-bold text-white flex items-center gap-1.5">
                                    <span>{st.staff_name}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-zinc-950 border border-zinc-800 text-amber-400 uppercase">
                                      {st.staff_role}
                                    </span>
                                  </h5>
                                  <p className="text-[10px] text-zinc-400 font-mono">
                                    Date: {st.assignment_date ? formatDateDDMMYY(st.assignment_date) : 'N/A'} • Mobile: {st.mobile || 'N/A'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-950 border border-zinc-800 text-zinc-300 uppercase">
                                  {st.task_status || st.assignment_status || 'Assigned'}
                                </span>
                              </div>
                            </div>

                            {/* Operations Image Sections */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                              {/* 1. EVENT START */}
                              <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                                  <span className="text-[10px] font-mono font-extrabold uppercase text-amber-400 tracking-wider flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>1. Event Start Proof</span>
                                  </span>
                                  <span className="text-[9px] font-mono font-bold text-zinc-500">
                                    {st.eventStartImages.length} Image{st.eventStartImages.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                {st.eventStartImages.length === 0 ? (
                                  <div className="py-4 text-center border border-dashed border-zinc-850 rounded-lg">
                                    <p className="text-zinc-500 text-[10px] font-mono">Pending Event Start Image</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 gap-2">
                                    {st.eventStartImages.map(img => (
                                      <div key={img.id} className="relative group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                                        <img 
                                          src={img.url} 
                                          alt={img.label} 
                                          referrerPolicy="no-referrer"
                                          className="w-full h-24 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewImage({
                                              url: img.url,
                                              title: img.label,
                                              taskName: st.staff_role,
                                              staffName: st.staff_name,
                                              department: 'Operations',
                                              uploadDate: img.uploadDate
                                            })}
                                            className="px-2.5 py-1 rounded bg-amber-500 text-zinc-950 text-xs font-bold font-mono hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer"
                                          >
                                            <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                                            <span>View Image</span>
                                          </button>
                                        </div>
                                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 text-[9px] font-mono text-zinc-400 flex justify-between">
                                          <span>{img.uploadDate}</span>
                                          <span>{img.uploadTime}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 4. EVENT END */}
                              <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                                  <span className="text-[10px] font-mono font-extrabold uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>4. Event End Proof</span>
                                  </span>
                                  <span className="text-[9px] font-mono font-bold text-zinc-500">
                                    {st.eventEndImages.length} Image{st.eventEndImages.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                {st.eventEndImages.length === 0 ? (
                                  <div className="py-4 text-center border border-dashed border-zinc-850 rounded-lg">
                                    <p className="text-zinc-500 text-[10px] font-mono">Pending Event End Image</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 gap-2">
                                    {st.eventEndImages.map(img => (
                                      <div key={img.id} className="relative group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                                        <img 
                                          src={img.url} 
                                          alt={img.label} 
                                          referrerPolicy="no-referrer"
                                          className="w-full h-24 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewImage({
                                              url: img.url,
                                              title: img.label,
                                              taskName: st.staff_role,
                                              staffName: st.staff_name,
                                              department: 'Operations',
                                              uploadDate: img.uploadDate
                                            })}
                                            className="px-2.5 py-1 rounded bg-emerald-500 text-zinc-950 text-xs font-bold font-mono hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer"
                                          >
                                            <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                                            <span>View Image</span>
                                          </button>
                                        </div>
                                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 text-[9px] font-mono text-zinc-400 flex justify-between">
                                          <span>{img.uploadDate}</span>
                                          <span>{img.uploadTime}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 2. EQUIPMENT RECEIVED */}
                              <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 space-y-2.5 sm:col-span-2">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                                  <span className="text-[10px] font-mono font-extrabold uppercase text-blue-400 tracking-wider flex items-center gap-1">
                                    <Package className="w-3.5 h-3.5" />
                                    <span>2. Equipment Received Proofs</span>
                                  </span>
                                </div>
                                {st.equipmentReceivedImages.length === 0 ? (
                                  <div className="py-4 text-center border border-dashed border-zinc-850 rounded-lg">
                                    <p className="text-zinc-500 text-[10px] font-mono">No Equipment Allocated</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {st.equipmentReceivedImages.map((eq, eqIdx) => (
                                      <div key={eqIdx} className="bg-zinc-900/60 border border-zinc-850/80 rounded-lg p-2.5 space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-mono">
                                          <span className="text-zinc-300 font-bold truncate max-w-[180px]">{eq.equipmentName}</span>
                                          <span className="px-1 rounded bg-blue-500/10 text-blue-400 font-extrabold font-sans text-[8px] tracking-wide uppercase">
                                            {eq.images.length > 0 ? 'Collected' : 'Pending'}
                                          </span>
                                        </div>
                                        {eq.images.length === 0 ? (
                                          <div className="py-3 text-center border border-dashed border-zinc-850 rounded bg-zinc-950/20">
                                            <p className="text-zinc-600 text-[9px] font-mono">Pending Equipment Collection Image</p>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 gap-1.5">
                                            {eq.images.map(img => (
                                              <div key={img.id} className="relative group overflow-hidden rounded border border-zinc-800 bg-zinc-950 h-16">
                                                <img 
                                                  src={img.url} 
                                                  alt={img.label} 
                                                  referrerPolicy="no-referrer"
                                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                  <button
                                                    type="button"
                                                    onClick={() => setPreviewImage({
                                                      url: img.url,
                                                      title: img.label,
                                                      taskName: `${st.staff_role} - Received: ${eq.equipmentName}`,
                                                      staffName: st.staff_name,
                                                      department: 'Operations',
                                                      uploadDate: img.uploadDate
                                                    })}
                                                    className="px-2 py-0.5 rounded bg-blue-500 text-zinc-950 text-[9px] font-bold font-mono hover:scale-105 transition-transform flex items-center gap-0.5 cursor-pointer"
                                                  >
                                                    <Eye className="w-3 h-3 stroke-[2.5]" />
                                                    <span>View</span>
                                                  </button>
                                                </div>
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1 text-[8px] font-mono text-zinc-400 flex justify-between">
                                                  <span>{img.uploadDate}</span>
                                                  <span>{img.uploadTime}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* 3. EQUIPMENT HANDOVER */}
                              <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 space-y-2.5 sm:col-span-2">
                                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                                  <span className="text-[10px] font-mono font-extrabold uppercase text-purple-400 tracking-wider flex items-center gap-1">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>3. Equipment Handover Proofs</span>
                                  </span>
                                </div>
                                {st.equipmentHandoverImages.length === 0 ? (
                                  <div className="py-4 text-center border border-dashed border-zinc-850 rounded-lg">
                                    <p className="text-zinc-550 text-[10px] font-mono">No Equipment Allocated</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {st.equipmentHandoverImages.map((eq, eqIdx) => (
                                      <div key={eqIdx} className="bg-zinc-900/60 border border-zinc-850/80 rounded-lg p-2.5 space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-mono">
                                          <span className="text-zinc-300 font-bold truncate max-w-[180px]">{eq.equipmentName}</span>
                                          <span className="px-1 rounded bg-purple-500/10 text-purple-400 font-extrabold font-sans text-[8px] tracking-wide uppercase">
                                            {eq.images.length > 0 ? 'Returned' : 'Pending'}
                                          </span>
                                        </div>
                                        {eq.images.length === 0 ? (
                                          <div className="py-3 text-center border border-dashed border-zinc-850 rounded bg-zinc-950/20">
                                            <p className="text-zinc-650 text-[9px] font-mono">Pending Equipment Handover Image</p>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 gap-1.5">
                                            {eq.images.map(img => (
                                              <div key={img.id} className="relative group overflow-hidden rounded border border-zinc-800 bg-zinc-950 h-16">
                                                <img 
                                                  src={img.url} 
                                                  alt={img.label} 
                                                  referrerPolicy="no-referrer"
                                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                                />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                  <button
                                                    type="button"
                                                    onClick={() => setPreviewImage({
                                                      url: img.url,
                                                      title: img.label,
                                                      taskName: `${st.staff_role} - Returned: ${eq.equipmentName}`,
                                                      staffName: st.staff_name,
                                                      department: 'Operations',
                                                      uploadDate: img.uploadDate
                                                    })}
                                                    className="px-2 py-0.5 rounded bg-purple-500 text-zinc-950 text-[9px] font-bold font-mono hover:scale-105 transition-transform flex items-center gap-0.5 cursor-pointer"
                                                  >
                                                    <Eye className="w-3 h-3 stroke-[2.5]" />
                                                    <span>View</span>
                                                  </button>
                                                </div>
                                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-1 text-[8px] font-mono text-zinc-400 flex justify-between">
                                                  <span>{img.uploadDate}</span>
                                                  <span>{img.uploadTime}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Raw Footage Link display */}
                            {st.raw_footage_link && (
                              <div className="pt-2 border-t border-zinc-850/80 flex items-center justify-between">
                                <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase">Field Output:</span>
                                <a 
                                  href={st.raw_footage_link.startsWith('http') ? st.raw_footage_link : `https://${st.raw_footage_link}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  referrerPolicy="no-referrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-bold font-mono border border-blue-500/20 bg-blue-500/5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Open Raw Footage Link</span>
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRODUCTION TASKS BREAKDOWN (INDIVIDUAL TASKS SHOWN SEPARATELY) */}
          {activeTab === 'production' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Production Editing Tasks ({matchedEditorAssignments.length})</span>
                </h3>
              </div>

              {matchedEditorAssignments.length === 0 ? (
                <div className="py-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                  <p className="text-zinc-500 text-xs font-mono">No specific individual production editor assignments recorded for this project.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matchedEditorAssignments.map((ea, idx) => {
                    // Unique proof image associated ONLY with this task (Requirement 5 & 8)
                    const taskProofCandidate = ea.confirmation_proof || ea.customer_communication_proof || ea.client_communication_proof || ea.proof_url || ea.proof_image || ea.uploaded_proof;
                    const resolvedTaskProof = taskProofCandidate ? resolveStorageUrl(taskProofCandidate) : null;

                    const rawFootageUrl = ea.raw_footage_link || ea.rawFootageLink;
                    const editedDriveUrl = ea.Edited_Drive_Link || ea.edited_drive_link;
                    const serverFileLinkUrl = ea.server_file_link || ea.upload_link;

                    return (
                      <div key={ea.assignment_id || idx} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <div>
                            <span className="text-[10px] font-mono text-purple-400 uppercase font-bold block">
                              Deliverable: {ea.speciality || 'Editing Task'}
                            </span>
                            <h4 className="text-sm font-bold text-white">{ea.staff_name || 'Assigned Editor'}</h4>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${
                            ['Editing Completed', 'Completed', 'Approved'].includes(ea.status)
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {ea.status || 'Editor Assigned'}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs font-mono text-zinc-400">
                          <div>Assigned Date: <span className="text-zinc-200">{ea.assigned_date ? formatDateDDMMYY(ea.assigned_date) : 'N/A'}</span></div>
                          <div>Target Finish: <span className="text-zinc-200">{ea.target_finish_date ? formatDateDDMMYY(ea.target_finish_date) : 'Standard'}</span></div>
                          
                          {/* Links */}
                          <div className="pt-1 flex flex-col gap-1">
                            {rawFootageUrl && (
                              <a 
                                href={rawFootageUrl.startsWith('http') ? rawFootageUrl : `https://${rawFootageUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                                className="inline-flex items-center gap-1 text-blue-400 hover:underline font-bold"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Raw Footage Drive Link</span>
                              </a>
                            )}
                            {editedDriveUrl && (
                              <a 
                                href={editedDriveUrl.startsWith('http') ? editedDriveUrl : `https://${editedDriveUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                                className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-bold"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Edited Drive Review Link</span>
                              </a>
                            )}
                            {serverFileLinkUrl && (
                              <a 
                                href={serverFileLinkUrl.startsWith('http') ? serverFileLinkUrl : `https://${serverFileLinkUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                referrerPolicy="no-referrer"
                                className="inline-flex items-center gap-1 text-purple-400 hover:underline font-bold"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Server File Link</span>
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Task-Specific Proof Image (Associated ONLY with this task) */}
                        {resolvedTaskProof && (
                          <div className="pt-2 border-t border-zinc-850 space-y-1.5">
                            <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 block">
                              Task-Specific Proof Image
                            </span>
                            <button
                              type="button"
                              onClick={() => setPreviewImage({
                                url: resolvedTaskProof,
                                title: `Proof Image - ${ea.speciality || 'Task'}`,
                                taskName: ea.speciality || 'Editing Task',
                                staffName: ea.staff_name || 'Editor',
                                department: 'Production',
                                uploadDate: ea.assigned_date ? formatDateDDMMYY(ea.assigned_date) : 'N/A'
                              })}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Task Proof Image</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PROOF IMAGES GALLERY & LIGHTBOX TRIGGER */}
          {activeTab === 'proofs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-400" />
                  <span>All Uploaded Proof Images ({allProofGallery.length})</span>
                </h3>
              </div>

              {allProofGallery.length === 0 ? (
                <div className="py-16 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                  <ImageIcon className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-400 text-sm font-medium">No proof images uploaded for this project yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {allProofGallery.map((proof) => (
                    <div key={proof.id} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col group hover:border-emerald-500/50 transition-all">
                      
                      {/* Thumbnail Container */}
                      <div 
                        className="relative h-44 bg-black overflow-hidden cursor-pointer flex items-center justify-center"
                        onClick={() => setPreviewImage({
                          url: proof.url,
                          title: proof.label,
                          taskName: proof.taskName,
                          staffName: proof.staffName,
                          department: proof.department,
                          uploadDate: proof.uploadDate
                        })}
                      >
                        <img 
                          src={proof.url} 
                          alt={proof.label} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs flex items-center gap-1 shadow-lg">
                            <Eye className="w-4 h-4" />
                            <span>Preview Image</span>
                          </span>
                        </div>
                      </div>

                      {/* Card Details */}
                      <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                            <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-emerald-400 font-bold">
                              {proof.department}
                            </span>
                            <span>{proof.uploadDate}</span>
                          </div>
                          <h5 className="text-xs font-bold text-white line-clamp-1">{proof.label}</h5>
                          <p className="text-[11px] text-zinc-400 font-mono mt-0.5 line-clamp-1">
                            Task: {proof.taskName}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-zinc-850 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <span>By: <strong className="text-zinc-200">{proof.staffName}</strong></span>
                          
                          <button
                            type="button"
                            onClick={() => setPreviewImage({
                              url: proof.url,
                              title: proof.label,
                              taskName: proof.taskName,
                              staffName: proof.staffName,
                              department: proof.department,
                              uploadDate: proof.uploadDate
                            })}
                            className="text-emerald-400 hover:underline font-bold"
                          >
                            Zoom
                          </button>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: FOOTAGE REPOSITORY */}
          {activeTab === 'footage' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span>Raw Footage & Server Upload Links</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Operations Footage Link */}
                {matchedOps.map((op, idx) => {
                  const link = op.Raw_Footage_Drive_Link || op.raw_footage_drive_link || op.Consolidated_Drive_Link;
                  if (!link) return null;

                  return (
                    <div key={`op_f_${idx}`} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-2">
                      <span className="text-[10px] font-mono font-bold uppercase text-amber-400 block">
                        Operations Field Footage
                      </span>
                      <h4 className="text-sm font-bold text-white">{op.custom_event_name || op.event_name || 'Event Coverage'}</h4>
                      <p className="text-xs font-mono text-zinc-400">
                        Crew: {[op.photographer_assigned, op.videographer_assigned].filter(Boolean).join(', ') || 'Field Team'}
                      </p>
                      <a 
                        href={link.startsWith('http') ? link : `https://${link}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Drive Folder Link</span>
                      </a>
                    </div>
                  );
                })}

                {/* Production Server Path Record */}
                {matchedProd?.server_path && (
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 space-y-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-purple-400 block">
                      Production Server Vault Path
                    </span>
                    <h4 className="text-sm font-bold text-white">{matchedProd.server_upload_folder_name || 'Production Storage'}</h4>
                    <p className="text-xs font-mono text-zinc-300 bg-zinc-950 p-2 rounded-lg border border-zinc-850">
                      Path: {matchedProd.server_path}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: QUOTATIONS & PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Payments & Financial Ledger</span>
                </h3>
              </div>

              {matchedPayments.length === 0 ? (
                <div className="py-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                  <p className="text-zinc-500 text-xs font-mono">No payment receipt transactions recorded yet.</p>
                </div>
              ) : (
                <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Mode</th>
                        <th className="py-3 px-4">Txn ID</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {matchedPayments.map((p, idx) => {
                        const amt = Number(p.advance_received || p.final_payment_received || p.amount || 0);
                        return (
                          <tr key={p.payment_id || idx} className="hover:bg-zinc-900/50">
                            <td className="py-3 px-4 text-zinc-300">{p.payment_date ? formatDateDDMMYY(p.payment_date) : 'N/A'}</td>
                            <td className="py-3 px-4 text-zinc-200">{p.payment_type || 'Installment'}</td>
                            <td className="py-3 px-4 text-emerald-400 font-bold">{formatINR(amt)}</td>
                            <td className="py-3 px-4 text-zinc-400">{p.payment_mode || 'Online/Bank'}</td>
                            <td className="py-3 px-4 text-zinc-500">{p.transaction_id || 'N/A'}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {p.payment_status || 'Received'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* FOOTER BAR */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 flex items-center justify-between shrink-0">
          <div className="text-xs text-zinc-500 font-mono">
            Showing <strong className="text-zinc-200">{timelineItems.length}</strong> logged historical milestones for this lead/order.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer transition-colors"
          >
            Close Roadmap
          </button>
        </div>

      </div>

      {/* FULL RESPONSIVE IMAGE LIGHTBOX PREVIEW MODAL */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-md z-[9999999] flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="p-4 border-b border-zinc-850 bg-zinc-900/90 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 tracking-wider block">
                  Proof Image Lightbox ({previewImage.department || 'Proof'})
                </span>
                <h4 className="text-sm font-bold text-white truncate mt-0.5">
                  {previewImage.title}
                </h4>
                {previewImage.taskName && (
                  <p className="text-xs text-zinc-400 font-mono">
                    Task: <strong className="text-zinc-200">{previewImage.taskName}</strong> • Staff: <strong className="text-zinc-200">{previewImage.staffName || 'Staff'}</strong>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Image Stage */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto flex items-center justify-center bg-black min-h-[320px]">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[68vh] max-w-full object-contain rounded-lg border border-zinc-800 shadow-2xl"
              />
            </div>

            {/* Lightbox Footer */}
            <div className="p-4 border-t border-zinc-850 bg-zinc-900/90 flex items-center justify-between shrink-0">
              <a
                href={previewImage.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Original High-Res Image</span>
              </a>

              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};
