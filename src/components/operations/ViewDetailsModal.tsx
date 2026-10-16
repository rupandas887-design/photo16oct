import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, User, Phone, MessageSquare, Mail, MapPin, Calendar, Clock, 
  Package, ShieldCheck, Video, Camera, Award, FileText, CheckCircle2, 
  ChevronDown, ChevronUp, Users, Check, AlertCircle, RefreshCw, Box
} from 'lucide-react';
import { useRole } from '../RoleContext';
import { deserializeLeadEvents, getEventTeamMemberStaffMapping, EventTeamMemberAssignmentGroup, formatDateDDMMYY, formatTime12Hour, formatISTTimestamp } from '../../utils';
import { SafeProofImage } from '../ui/SafeProofImage';

interface ViewDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  booking?: any;
  isStaffView?: boolean;
}

export interface EquipmentItemDetail {
  name: string;
  assetId?: string;
  category?: string;
  assignedStaff?: string;
  assignedStaffRole?: string;
  eventId?: string;
  eventName?: string;
  isReturned: boolean;
  returnStatus: 'Returned' | 'Pending / Not Returned' | 'Damaged' | 'Missing' | 'Not Returned';
  returnedBy?: string;
  returnDate?: string;
  notes?: string;
}

export const ViewDetailsModal: React.FC<ViewDetailsModalProps> = ({
  isOpen,
  onClose,
  orderId,
  booking,
  isStaffView
}) => {
  const modalScrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (modalScrollRef.current) {
        modalScrollRef.current.scrollTop = 0;
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const { 
    currentRole,
    currentUser,
    orders, 
    leads, 
    operations, 
    payments, 
    staffAssignments, 
    staff,
    equipment, 
    leadPackages, 
    packages,
    leadEquipmentHistory,
    equipmentHandovers,
    refreshData
  } = useRole();

  const [isCustomerDetailsOpen, setIsCustomerDetailsOpen] = useState(true);

  const rawTarget = orderId || booking?.orderId || booking?.order_id || booking?.leadId || '';
  const targetOrderId = typeof rawTarget === 'string' ? rawTarget.split('_')[0] : rawTarget;

  // Resolve Order & Lead data
  const order = orders?.find(o => o.order_id === targetOrderId || o.lead_id === targetOrderId);
  const lead = (order?.lead_id ? leads?.find(l => l.lead_id === order.lead_id) : null) || 
               leads?.find(l => l.lead_id === targetOrderId) ||
               (booking?.leadId ? leads?.find(l => l.lead_id === booking.leadId) : null) ||
               (booking?.lead_id ? leads?.find(l => l.lead_id === booking.lead_id) : null);
  const operation = operations?.find(op => op.order_id === targetOrderId || op.order_id === order?.order_id);
  const payment = payments?.find(p => p.order_id === targetOrderId || p.order_id === order?.order_id);
  const targetLeadPkgs = leadPackages?.filter(lp => lp.lead_id === (lead?.lead_id || targetOrderId)) || [];

  // Customer Details
  const customerName = order?.customer_name || lead?.customer_name || booking?.customerName || 'N/A';
  const mobileNumber = order?.mobile || lead?.mobile || booking?.customerMobile || 'N/A';
  const whatsappNumber = lead?.whatsapp_number || booking?.customerWhatsapp || order?.whatsapp_number || mobileNumber || 'N/A';
  const alternateMobile = lead?.alt_mobile || lead?.alternate_mobile || (lead as any)?.alt_phone || order?.alternate_mobile || booking?.customerAltMobile || 'N/A';
  const address = lead?.address || lead?.client_residence_address || order?.address || (lead?.city ? `${lead.city}${lead.state ? `, ${lead.state}` : ''}` : null) || booking?.customerAddress || 'N/A';

  const finalOrderId = order?.order_id || booking?.orderId || targetOrderId || 'N/A';

  const isStaff = isStaffView || 
                  currentRole === 'Staff' || 
                  currentRole === 'Operation Staff' || 
                  currentRole === 'Operations Staff' ||
                  Boolean(booking?.staffName || booking?.assignedStaff || booking?.assignmentId);

  // Resolve current staff member object matching logged in user or booking
  const currentStaffMember = useMemo(() => {
    return (staff || []).find(s => 
      (s.auth_user_id && currentUser?.id && s.auth_user_id === currentUser.id) || 
      (s.email && currentUser?.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
      (s.mobile && currentUser?.mobile && s.mobile === currentUser.mobile) ||
      (s.name && currentUser?.name && s.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
      (s.name && currentUser?.full_name && s.name.trim().toLowerCase() === currentUser.full_name.trim().toLowerCase())
    );
  }, [staff, currentUser]);

  const effectiveStaffName = useMemo(() => {
    const fromBooking = booking?.staffName || booking?.assignedStaff || booking?.staff_name || booking?.assignedStaffName;
    if (fromBooking && typeof fromBooking === 'string' && fromBooking.trim()) {
      return fromBooking.trim();
    }
    const fromCurrentStaff = currentStaffMember?.name;
    if (fromCurrentStaff && fromCurrentStaff.trim()) {
      return fromCurrentStaff.trim();
    }
    const fromCurrentUser = currentUser?.name || currentUser?.full_name;
    if (fromCurrentUser && typeof fromCurrentUser === 'string' && fromCurrentUser.trim()) {
      return fromCurrentUser.trim();
    }
    return '';
  }, [booking, currentStaffMember, currentUser]);

  // Extract Event Team Member Assignment Groups using canonical helper
  const allAssignmentGroups = useMemo(() => {
    return getEventTeamMemberStaffMapping({
      lead: lead,
      order: order,
      leadPkgs: targetLeadPkgs,
      staffAssignments: staffAssignments,
      operationsRecord: operation,
      staffList: staff,
      targetStaffName: effectiveStaffName || undefined
    });
  }, [lead, order, targetLeadPkgs, staffAssignments, operation, staff, effectiveStaffName]);

  const targetEvId = booking?.eventId || booking?.event_id || booking?.assignment?.event_id;
  const targetEvName = booking?.eventName || booking?.event_name || booking?.assignment?.event_name || booking?.shootType;
  const targetEvType = booking?.eventType || booking?.event_type || booking?.assignment?.event_type;

  // Filter display groups strictly by assigned staff member + assigned event for staff view
  const displayGroups = useMemo(() => {
    if (!allAssignmentGroups || allAssignmentGroups.length === 0) return [];

    if (isStaff && effectiveStaffName) {
      const staffNorm = effectiveStaffName.toLowerCase().trim();
      const staffId = currentStaffMember?.staff_id || (currentStaffMember as any)?.id;

      const assignedGroups = allAssignmentGroups.filter(g => {
        // 1. Direct match in group.mappings (team members assigned to this staff member)
        if (g.mappings && g.mappings.some(m => {
          const assignedName = (m.assignedStaffName || '').trim().toLowerCase();
          if (assignedName && assignedName !== 'unassigned' && assignedName !== 'none') {
            if (assignedName === staffNorm) return true;
          }
          if (staffId && m.assignedStaffId && String(m.assignedStaffId) === String(staffId)) {
            return true;
          }
          return false;
        })) {
          return true;
        }

        // 2. Direct match in staffAssignments table from database
        if (staffAssignments && staffAssignments.length > 0) {
          const hasDbAssignment = staffAssignments.some(sa => {
            if (sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return false;
            
            const saStaffName = (sa.staff_name || '').trim().toLowerCase();
            const saStaffId = sa.staff_id;
            const isMatchingStaff = saStaffName === staffNorm || (staffId && saStaffId && String(saStaffId) === String(staffId));
            if (!isMatchingStaff) return false;

            const matchesOrder = (targetOrderId && (sa.order_id === targetOrderId || sa.lead_id === targetOrderId)) ||
                                 (order?.order_id && (sa.order_id === order.order_id || sa.lead_id === order.order_id)) ||
                                 (lead?.lead_id && (sa.order_id === lead.lead_id || sa.lead_id === lead.lead_id));
            if (!matchesOrder) return false;

            // Event-level match
            if (sa.event_id && g.eventId) {
              if (String(sa.event_id).toLowerCase() === String(g.eventId).toLowerCase()) return true;
            }
            if (sa.event_name) {
              const sEvName = sa.event_name.trim().toLowerCase();
              if (sEvName === g.eventName.toLowerCase().trim() || sEvName === g.eventType.toLowerCase().trim()) return true;
            }
            // If neither event_id nor event_name is specified on assignment, match only if single event or general event
            if (!sa.event_id && !sa.event_name && (allAssignmentGroups.length === 1 || g.eventId === 'default_event' || g.eventId === 'gen')) {
              return true;
            }

            return false;
          });

          if (hasDbAssignment) return true;
        }

        // 3. Direct match in lead.events or order.events (assigned_staff_names / assigned_staff_ids field)
        const checkEventsArray = (eventsList: any[]) => {
          if (!Array.isArray(eventsList)) return false;
          return eventsList.some(ev => {
            const evId = String(ev.id || ev.event_id || '');
            const evName = (ev.event_name || ev.custom_event_name || ev.event_type || '').trim().toLowerCase();
            const isMatchingEv = (evId && g.eventId && evId.toLowerCase() === String(g.eventId).toLowerCase()) ||
                                 (evName && (evName === g.eventName.toLowerCase().trim() || evName === g.eventType.toLowerCase().trim()));
            
            if (isMatchingEv) {
              if (ev.assigned_staff_names) {
                const names = ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase()).filter(Boolean);
                if (names.includes(staffNorm)) return true;
              }
              if (ev.assigned_staff_ids && staffId) {
                const ids = ev.assigned_staff_ids.split(',').map((id: string) => id.trim()).filter(Boolean);
                if (ids.includes(String(staffId))) return true;
              }
            }
            return false;
          });
        };

        if (lead?.events && checkEventsArray(lead.events)) return true;
        if (order?.events && checkEventsArray(order.events)) return true;

        // 4. Check deserialized notes_special_customizations
        if (lead?.notes_special_customizations) {
          try {
            const parsed = deserializeLeadEvents(lead.notes_special_customizations);
            if (parsed.events && checkEventsArray(parsed.events)) return true;
          } catch (e) {}
        }
        if (order?.notes_special_customizations) {
          try {
            const parsed = deserializeLeadEvents(order.notes_special_customizations);
            if (parsed.events && checkEventsArray(parsed.events)) return true;
          } catch (e) {}
        }

        // 5. Check operationsRecord (for single event or general assignment)
        if (allAssignmentGroups.length === 1 || g.eventId === 'default_event' || g.eventId === 'gen') {
          if (operation) {
            if (operation.photographer_assigned?.trim().toLowerCase() === staffNorm) return true;
            if (operation.videographer_assigned?.trim().toLowerCase() === staffNorm) return true;
            if (operation.drone_operator_assigned?.trim().toLowerCase() === staffNorm) return true;
            if (operation.assistant_assigned?.trim().toLowerCase() === staffNorm) return true;
          }
        }

        // 6. Check booking context if booking specifically passed this event
        if (booking) {
          const bStaff = (booking.assignedStaff || booking.staffName || booking.staff_name || '').trim().toLowerCase();
          if (!bStaff || bStaff === staffNorm) {
            if (booking.eventId && g.eventId && String(booking.eventId).toLowerCase() === String(g.eventId).toLowerCase()) {
              return true;
            }
            if (booking.eventName && (booking.eventName.toLowerCase().trim() === g.eventName.toLowerCase().trim() || booking.eventName.toLowerCase().trim() === g.eventType.toLowerCase().trim())) {
              return true;
            }
          }
        }

        return false;
      });

      // If a specific booking event is passed, show that specific assigned event
      if (targetEvId || targetEvName || targetEvType) {
        const specificMatches = assignedGroups.filter(g => {
          if (targetEvId && targetEvId !== 'ev' && targetEvId !== 'gen' && g.eventId) {
            if (String(g.eventId).toLowerCase() === String(targetEvId).toLowerCase()) return true;
          }
          if (targetEvName) {
            const tName = String(targetEvName).toLowerCase().trim();
            if (g.eventName.toLowerCase().trim() === tName || g.eventType.toLowerCase().trim() === tName) return true;
          }
          if (targetEvType) {
            const tType = String(targetEvType).toLowerCase().trim();
            if (g.eventType.toLowerCase().trim() === tType) return true;
          }
          return false;
        });
        if (specificMatches.length > 0) {
          return specificMatches;
        }
      }

      return assignedGroups;
    }

    // For non-staff (e.g. manager / admin viewing details), check target event if specific booking passed
    if (targetEvId || targetEvName || targetEvType) {
      const matched = allAssignmentGroups.filter(g => {
        if (targetEvId && String(g.eventId).toLowerCase() === String(targetEvId).toLowerCase()) return true;
        if (targetEvName && (g.eventName.toLowerCase() === String(targetEvName).toLowerCase() || g.eventType.toLowerCase() === String(targetEvName).toLowerCase())) return true;
        if (targetEvType && g.eventType.toLowerCase() === String(targetEvType).toLowerCase()) return true;
        return false;
      });
      if (matched.length > 0) {
        return matched;
      }
    }

    return allAssignmentGroups;
  }, [allAssignmentGroups, isStaff, effectiveStaffName, currentStaffMember, staffAssignments, targetOrderId, order, lead, operation, booking, targetEvId, targetEvName, targetEvType]);

  // Extract comprehensive Equipment Given and Equipment Returned dataset
  const equipmentDetailsList: EquipmentItemDetail[] = useMemo(() => {
    const map = new Map<string, EquipmentItemDetail>();

    const getAssetIdAndCategory = (eqName: string) => {
      const found = (equipment || []).find(e => e.equipment_name?.toLowerCase().trim() === eqName.toLowerCase().trim());
      return {
        assetId: found?.asset_id || found?.serial_number || 'EQ-' + Math.abs(eqName.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)).toString().slice(0, 6),
        category: found?.category || 'Equipment'
      };
    };

    // A. From displayGroups (mappings)
    displayGroups.forEach(group => {
      group.mappings.forEach(m => {
        if (m.equipment && Array.isArray(m.equipment)) {
          m.equipment.forEach(eqName => {
            const cleanName = eqName.trim();
            if (!cleanName) return;
            const key = cleanName.toLowerCase();
            if (!map.has(key)) {
              const meta = getAssetIdAndCategory(cleanName);
              map.set(key, {
                name: cleanName,
                assetId: meta.assetId,
                category: meta.category,
                assignedStaff: m.assignedStaffName !== 'Unassigned' ? m.assignedStaffName : undefined,
                assignedStaffRole: m.assignedStaffRole || m.teamMemberRole,
                eventId: group.eventId,
                eventName: group.eventName,
                isReturned: false,
                returnStatus: 'Pending / Not Returned'
              });
            } else {
              const existing = map.get(key)!;
              if (!existing.assignedStaff && m.assignedStaffName !== 'Unassigned') {
                existing.assignedStaff = m.assignedStaffName;
                existing.assignedStaffRole = m.assignedStaffRole || m.teamMemberRole;
              }
              if (!existing.eventName) existing.eventName = group.eventName;
            }
          });
        }
      });
    });

    // B. From staffAssignments (for order / lead)
    const matchingAssignments = (staffAssignments || []).filter(sa => {
      const matchesOrder = sa.order_id === targetOrderId || sa.order_id === order?.order_id || (lead?.lead_id && sa.order_id === lead.lead_id);
      if (!matchesOrder) return false;
      if (isStaff && effectiveStaffName) {
        if ((sa.staff_name || '').trim().toLowerCase() !== effectiveStaffName.toLowerCase()) return false;
        if (displayGroups && displayGroups.length > 0) {
          const matchesAnyGroup = displayGroups.some(g => {
            if (sa.event_id && g.eventId && String(sa.event_id).toLowerCase() === String(g.eventId).toLowerCase()) return true;
            if (sa.event_name && (sa.event_name.trim().toLowerCase() === g.eventName.toLowerCase() || sa.event_name.trim().toLowerCase() === g.eventType.toLowerCase())) return true;
            if (!sa.event_id && !sa.event_name && displayGroups.length === 1) return true;
            return false;
          });
          if (!matchesAnyGroup) return false;
        }
      }
      return true;
    });
    matchingAssignments.forEach(sa => {
      let eqList: string[] = [];
      if (Array.isArray(sa.equipment)) {
        eqList = sa.equipment;
      } else if (typeof sa.equipment === 'string') {
        try {
          const parsed = JSON.parse(sa.equipment);
          if (Array.isArray(parsed)) eqList = parsed;
          else eqList = sa.equipment.split(',').map(s => s.trim()).filter(Boolean);
        } catch (e) {
          eqList = sa.equipment.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      eqList.forEach(eqName => {
        const cleanName = eqName.trim();
        if (!cleanName) return;
        const key = cleanName.toLowerCase();
        if (!map.has(key)) {
          const meta = getAssetIdAndCategory(cleanName);
          map.set(key, {
            name: cleanName,
            assetId: meta.assetId,
            category: meta.category,
            assignedStaff: sa.staff_name,
            assignedStaffRole: sa.staff_role,
            eventId: sa.event_id,
            eventName: sa.event_name,
            isReturned: false,
            returnStatus: 'Pending / Not Returned'
          });
        } else {
          const existing = map.get(key)!;
          if (!existing.assignedStaff && sa.staff_name) {
            existing.assignedStaff = sa.staff_name;
            existing.assignedStaffRole = sa.staff_role;
          }
          if (!existing.eventName && sa.event_name) existing.eventName = sa.event_name;
        }
      });
    });

    // C. From operation.equipment_kit (only if not filtered to another staff member)
    if (operation?.equipment_kit && (!isStaff || !effectiveStaffName || operation.photographer_assigned?.toLowerCase() === effectiveStaffName.toLowerCase() || operation.videographer_assigned?.toLowerCase() === effectiveStaffName.toLowerCase())) {
      const kits = operation.equipment_kit.split(',').map(s => s.trim()).filter(Boolean);
      kits.forEach(kitName => {
        const key = kitName.toLowerCase();
        if (!map.has(key)) {
          const meta = getAssetIdAndCategory(kitName);
          map.set(key, {
            name: kitName,
            assetId: meta.assetId,
            category: meta.category,
            assignedStaff: operation.photographer_assigned || operation.videographer_assigned || undefined,
            isReturned: false,
            returnStatus: 'Pending / Not Returned'
          });
        }
      });
    }

    // D. From booking?.equipmentItems
    if (booking?.equipmentItems && Array.isArray(booking.equipmentItems)) {
      booking.equipmentItems.forEach((bItem: any) => {
        const bName = (bItem.name || bItem.equipment_name || '').trim();
        if (!bName) return;
        const key = bName.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name: bName,
            assetId: bItem.assetId || bItem.asset_id || getAssetIdAndCategory(bName).assetId,
            category: bItem.category || getAssetIdAndCategory(bName).category,
            assignedStaff: booking.assignedStaff || booking.staff_name,
            isReturned: false,
            returnStatus: 'Pending / Not Returned'
          });
        }
      });
    }

    // E. From leadEquipmentHistory (Assigned records)
    const orderHistory = (leadEquipmentHistory || []).filter(h => 
      (h.order_id && (h.order_id === targetOrderId || h.order_id === order?.order_id)) ||
      (h.lead_id && lead?.lead_id && h.lead_id === lead.lead_id)
    );

    const nonEquipmentKeywords = [
      'photo proof', 'image proof', 'start image', 'verification', 'asset collection',
      'raw footage verification', 'event start photo', 'event completion photo', 'equipment handover photo', 'asset return photo'
    ];

    orderHistory.forEach(h => {
      const eqName = (h.equipment_name || '').trim();
      if (!eqName) return;
      const isMetaRecord = nonEquipmentKeywords.some(kw => eqName.toLowerCase().includes(kw));
      if (isMetaRecord) return;

      const key = eqName.toLowerCase();
      if (!map.has(key)) {
        const meta = getAssetIdAndCategory(eqName);
        map.set(key, {
          name: eqName,
          assetId: meta.assetId,
          category: meta.category,
          assignedStaff: h.assigned_to,
          isReturned: false,
          returnStatus: 'Pending / Not Returned'
        });
      }
    });

    // F. From equipmentHandovers
    const orderHandovers = (equipmentHandovers || []).filter(eh => 
      eh.order_id === targetOrderId || eh.order_id === order?.order_id
    );
    orderHandovers.forEach(eh => {
      const eqName = (eh.equipment_name || '').trim();
      if (!eqName) return;
      const key = eqName.toLowerCase();
      if (!map.has(key)) {
        const meta = getAssetIdAndCategory(eqName);
        map.set(key, {
          name: eqName,
          assetId: meta.assetId,
          category: meta.category,
          isReturned: false,
          returnStatus: 'Pending / Not Returned'
        });
      }
    });

    // CHECK RETURN STATUS FOR EACH GIVEN EQUIPMENT ITEM
    map.forEach((item, key) => {
      // 1. Check equipmentHandovers first
      const matchedHandover = orderHandovers.find(eh => eh.equipment_name?.toLowerCase().trim() === key);
      if (matchedHandover) {
        if (matchedHandover.return_status === 'Returned') {
          item.isReturned = true;
          item.returnStatus = 'Returned';
          item.returnedBy = matchedHandover.returned_by;
          item.returnDate = matchedHandover.return_date ? formatDateDDMMYY(matchedHandover.return_date) : matchedHandover.return_date;
          item.notes = matchedHandover.notes;
        } else if (matchedHandover.return_status === 'Damaged') {
          item.isReturned = true;
          item.returnStatus = 'Damaged';
          item.returnedBy = matchedHandover.returned_by;
          item.returnDate = matchedHandover.return_date ? formatDateDDMMYY(matchedHandover.return_date) : matchedHandover.return_date;
          item.notes = matchedHandover.notes;
        } else if (matchedHandover.return_status === 'Missing') {
          item.isReturned = false;
          item.returnStatus = 'Missing';
          item.returnedBy = matchedHandover.returned_by;
          item.returnDate = matchedHandover.return_date ? formatDateDDMMYY(matchedHandover.return_date) : matchedHandover.return_date;
          item.notes = matchedHandover.notes;
        } else if (matchedHandover.return_status === 'Not Returned') {
          item.isReturned = false;
          item.returnStatus = 'Not Returned';
        }
      }

      // 2. Check leadEquipmentHistory
      const matchedHistories = orderHistory.filter(h => h.equipment_name?.toLowerCase().trim() === key);
      if (matchedHistories.length > 0) {
        // Find if there's any record with status Returned or returned_at
        const returnRecord = matchedHistories.find(h => 
          h.equipment_status === 'Returned' || 
          h.equipment_status === 'Equipment Handover Completed' || 
          h.equipment_status === 'Equipment Handover' ||
          (h.returned_at && h.equipment_status !== 'Assigned' && h.equipment_status !== 'Equipment Not Handover')
        );

        if (returnRecord) {
          item.isReturned = true;
          item.returnStatus = 'Returned';
          item.returnedBy = returnRecord.returned_by || item.returnedBy || 'Operations Staff';
          item.returnDate = returnRecord.returned_at ? formatDateDDMMYY(returnRecord.returned_at) : (item.returnDate || 'Returned');
          if (returnRecord.remarks && !item.notes) {
            try {
              const p = JSON.parse(returnRecord.remarks);
              if (p.notes) item.notes = p.notes;
            } catch (e) {
              if (typeof returnRecord.remarks === 'string' && !returnRecord.remarks.startsWith('{')) {
                item.notes = returnRecord.remarks;
              }
            }
          }
        }
      }
    });

    return Array.from(map.values());
  }, [
    displayGroups, 
    staffAssignments, 
    targetOrderId, 
    order, 
    lead, 
    operation, 
    booking, 
    leadEquipmentHistory, 
    equipmentHandovers, 
    equipment
  ]);

  const givenEquipmentList = equipmentDetailsList;
  const returnedEquipmentList = useMemo(() => equipmentDetailsList.filter(e => e.isReturned), [equipmentDetailsList]);
  const pendingEquipmentList = useMemo(() => equipmentDetailsList.filter(e => !e.isReturned), [equipmentDetailsList]);

  // Extract Proof Records for this order or specific booking
  const proofRecords = useMemo(() => {
    return (leadEquipmentHistory || []).filter(h => {
      const matchOrder = (finalOrderId && h.order_id === finalOrderId) || (lead?.lead_id && h.lead_id === lead.lead_id);
      if (!matchOrder) return false;

      // If a specific booking is being viewed, filter strictly for that task/event
      if (booking) {
        let parsed: any = {};
        if (h.remarks) {
          try { parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks; } catch (e) {}
        }
        const recordStaff = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
        const bookingStaff = (booking.staffName || booking.name || '').trim().toLowerCase();
        
        if (bookingStaff && recordStaff && recordStaff !== bookingStaff) return false;
        
        if (parsed.assignment_id && booking.assignmentId && parsed.assignment_id !== booking.assignmentId) return false;
        
        if (parsed.assignment_id && !booking.assignmentId) return false;
        
        if (booking.assignmentId && !parsed.assignment_id) {
          // If the record has no assignment ID but our booking does, fallback to event/role matching
          if (parsed.event_id && booking.eventId && parsed.event_id !== 'gen' && parsed.event_id !== 'ev' && booking.eventId !== 'gen' && booking.eventId !== 'ev' && parsed.event_id !== booking.eventId) return false;
          if (parsed.staff_role && booking.assignedRole && parsed.staff_role.trim().toLowerCase() !== booking.assignedRole.trim().toLowerCase()) return false;
        }

        if (parsed.event_id && booking.eventId && parsed.event_id !== 'gen' && parsed.event_id !== 'ev' && booking.eventId !== 'gen' && booking.eventId !== 'ev' && parsed.event_id !== booking.eventId) return false;
      }
      return true;
    }).map(h => {
      let photoUrl = '';
      let rawFootageLink = '';
      let proofType = h.equipment_status || 'Proof';
      if (h.remarks) {
        try {
          const parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks;
          photoUrl = parsed.photo_url || photoUrl;
          rawFootageLink = parsed.raw_footage_link || rawFootageLink;
          proofType = parsed.proof_type || proofType;
        } catch (e) {}
      }
      return {
        id: h.id,
        equipmentName: h.equipment_name,
        status: h.equipment_status,
        proofType,
        uploadedBy: h.returned_by || 'Staff',
        uploadedAt: h.returned_at ? formatISTTimestamp(h.returned_at) : 'N/A',
        photoUrl,
        rawFootageLink
      };
    });
  }, [leadEquipmentHistory, finalOrderId, lead, booking]);

  if (!isOpen || (!orderId && !booking)) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl 2xl:max-w-6xl min-[1920px]:max-w-[1400px] min-[2560px]:max-w-[1800px] min-[3840px]:max-w-[2400px] shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] min-h-0 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/70 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-lg shrink-0">
              📋
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                  Order ID: <span className="text-amber-400">{finalOrderId}</span>
                </h3>
                {order?.order_status && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 uppercase">
                    {order.order_status}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-sans">
                {isStaff ? 'Assigned Operations Event Details & Team Roster' : 'Comprehensive Operations & Staff Assignment Dossier'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center font-bold cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div ref={modalScrollRef} className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6 text-zinc-300">
          
          {/* Section 1: Customer Details */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsCustomerDetailsOpen(!isCustomerDetailsOpen)}
                className="flex items-center gap-2 text-xs font-bold text-sky-400 font-mono uppercase tracking-wider hover:text-sky-300 transition-colors cursor-pointer"
              >
                <User className="w-4 h-4 text-sky-400" /> Customer Details
                {isCustomerDetailsOpen ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
              </button>
              <span className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-none">{customerName}</span>
            </div>

            {isCustomerDetailsOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-zinc-800/60 pt-3 mt-2">
                <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/60">
                  <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-1">Customer Name</span>
                  <span className="text-xs font-bold text-white break-words">{customerName}</span>
                </div>
                <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/60">
                  <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-1">Mobile Number</span>
                  <span className="text-xs font-semibold text-zinc-200 font-mono">{mobileNumber}</span>
                </div>
                <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/60">
                  <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-1">WhatsApp Number</span>
                  <span className="text-xs font-semibold text-zinc-200 font-mono">{whatsappNumber}</span>
                </div>
                <div className="bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/60">
                  <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-1">Alternate Mobile</span>
                  <span className="text-xs font-semibold text-zinc-200 font-mono">{alternateMobile}</span>
                </div>

              </div>
            )}
          </div>

          {/* Section 2: Event Details & Team Members Included Mapping */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2 font-mono">
                <Calendar className="w-4 h-4 text-amber-400" /> 
                {displayGroups.length > 1 ? `Events & Staff Allocations (${displayGroups.length} Events)` : 'Event Details & Staff Allocation'}
              </h4>
              <span className="text-xs font-mono text-zinc-400 font-bold">Order: {finalOrderId}</span>
            </div>

            {displayGroups.map((group, gIdx) => (
              <div key={group.eventId || gIdx} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                
                {/* Event Title Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded">
                      {displayGroups.length > 1 ? `Event ${gIdx + 1}` : 'Event Type'}: {group.eventType}
                    </span>
                    <span className="text-sm font-black text-white font-mono">
                      {group.eventName}
                    </span>
                  </div>
                  {group.googleMapsLink && group.googleMapsLink !== 'N/A' && (
                    <a 
                      href={group.googleMapsLink.startsWith('http') ? group.googleMapsLink : `https://${group.googleMapsLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-400 hover:text-sky-300 hover:underline font-mono inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" /> Venue Map
                    </a>
                  )}
                </div>

                {/* Event Timing & Location Grid */}
                {(() => {
                  const resolvedMapLink = (() => {
                    if (group.googleMapsLink && group.googleMapsLink !== 'N/A' && group.googleMapsLink.trim() !== '') {
                      return group.googleMapsLink.trim();
                    }
                    if (booking) {
                      const isMatchingEvent = !booking.eventId || booking.eventId === 'ev' || booking.eventId === 'gen' || String(booking.eventId).toLowerCase() === String(group.eventId).toLowerCase();
                      if (isMatchingEvent && booking.googleMapsLink && booking.googleMapsLink !== 'N/A' && booking.googleMapsLink.trim() !== '') {
                        return booking.googleMapsLink.trim();
                      }
                    }
                    if (lead?.events && Array.isArray(lead.events)) {
                      const matchedEv = lead.events.find((e: any) => String(e.id || e.event_id).toLowerCase() === String(group.eventId).toLowerCase());
                      if (matchedEv?.google_maps_link && matchedEv.google_maps_link !== 'N/A' && matchedEv.google_maps_link.trim() !== '') {
                        return matchedEv.google_maps_link.trim();
                      }
                      if (lead.events.length === 1 && lead.events[0]?.google_maps_link && lead.events[0].google_maps_link !== 'N/A' && lead.events[0].google_maps_link.trim() !== '') {
                        return lead.events[0].google_maps_link.trim();
                      }
                    }
                    if (lead?.notes_special_customizations) {
                      try {
                        const parsed = deserializeLeadEvents(lead.notes_special_customizations);
                        if (parsed.events && parsed.events.length > 0) {
                          const matchedEv = parsed.events.find((e: any) => String(e.id || e.event_id).toLowerCase() === String(group.eventId).toLowerCase());
                          if (matchedEv?.google_maps_link && matchedEv.google_maps_link !== 'N/A' && matchedEv.google_maps_link.trim() !== '') {
                            return matchedEv.google_maps_link.trim();
                          }
                          if (parsed.events.length === 1 && parsed.events[0]?.google_maps_link && parsed.events[0].google_maps_link !== 'N/A' && parsed.events[0].google_maps_link.trim() !== '') {
                            return parsed.events[0].google_maps_link.trim();
                          }
                        }
                      } catch(e) {}
                    }
                    const totalEventsInLead = (lead?.events && Array.isArray(lead.events) ? lead.events.length : 0);
                    if (totalEventsInLead <= 1) {
                      if (lead?.google_maps_link && lead.google_maps_link !== 'N/A' && lead.google_maps_link.trim() !== '') {
                        return lead.google_maps_link.trim();
                      }
                      if (order?.google_maps_link && order.google_maps_link !== 'N/A' && order.google_maps_link.trim() !== '') {
                        return order.google_maps_link.trim();
                      }
                    }
                    return null;
                  })();

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Event Date</span>
                        <span className="font-bold text-zinc-100 font-mono">{formatDateDDMMYY(group.eventDate)}</span>
                      </div>
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Event Start Time</span>
                        <span className="font-bold text-emerald-400 font-mono">{formatTime12Hour(group.eventStartTime)}</span>
                      </div>
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Reporting Date</span>
                        <span className="font-bold text-sky-300 font-mono">{formatDateDDMMYY(group.reportingDate)}</span>
                      </div>
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Reporting Time</span>
                        <span className="font-bold text-sky-400 font-mono">{formatTime12Hour(group.reportingTime)}</span>
                      </div>
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60 sm:col-span-2 lg:col-span-2">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Event Location / Venue</span>
                        <span className="font-medium text-zinc-200 break-words">{group.location}</span>
                      </div>
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60 sm:col-span-2 lg:col-span-1">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Google Maps Location</span>
                        {resolvedMapLink ? (
                          <a 
                            href={resolvedMapLink.startsWith('http') ? resolvedMapLink : `https://${resolvedMapLink}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300 hover:underline font-mono transition-colors break-all"
                          >
                            <MapPin className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                            <span>View on Google Maps</span>
                            <span className="text-[11px] leading-none">↗</span>
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 font-mono italic">
                            Not provided
                          </span>
                        )}
                      </div>
                      <div className="bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800/60 sm:col-span-2 lg:col-span-1">
                        <span className="block text-[10px] text-zinc-500 font-mono font-semibold uppercase mb-0.5">Guest Pax</span>
                        <span className="font-semibold text-zinc-200">{group.guestPax}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Team Members Included & Staff Assignment Mapping Table */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[11px] font-mono font-bold uppercase text-sky-400 tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Team Members Included → Assigned Staff
                    </h5>
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                      {group.mappings.filter(m => m.assignedStaffName !== 'Unassigned').length} / {group.mappings.length} Allocated
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/90 shadow-inner">
                    <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                      <thead>
                        <tr className="bg-zinc-900/90 border-b border-zinc-800 text-[10.5px] font-mono uppercase tracking-wider text-zinc-400">
                          <th className="py-2.5 px-4 font-bold">Team Member Included</th>
                          <th className="py-2.5 px-4 font-bold">Assigned Staff & Gear</th>
                          <th className="py-2.5 px-4 font-bold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {group.mappings.length > 0 ? (
                          group.mappings.map((mapping, mIdx) => (
                            <tr key={mIdx} className="hover:bg-zinc-900/40 transition-colors">
                              <td className="py-3 px-4 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0"></span>
                                  <span className="font-bold text-zinc-100 font-sans">
                                    {mapping.teamMemberRole}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 align-top">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-bold ${mapping.assignedStaffName !== 'Unassigned' ? 'text-white' : 'text-zinc-500 italic'}`}>
                                    {mapping.assignedStaffName}
                                  </span>
                                  {mapping.assignedStaffName !== 'Unassigned' && mapping.assignedStaffType && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                      {mapping.assignedStaffType}
                                    </span>
                                  )}
                                </div>
                                {mapping.mobile && (
                                  <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                                    📞 {mapping.mobile}
                                  </span>
                                )}

                                {/* Per-staff assigned equipment badges */}
                                {mapping.equipment && mapping.equipment.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {mapping.equipment.map((eqName: string, eqIdx: number) => {
                                      const eqDetail = equipmentDetailsList.find(e => e.name.toLowerCase().trim() === eqName.toLowerCase().trim());
                                      const isRet = eqDetail?.isReturned;
                                      return (
                                        <span 
                                          key={eqIdx} 
                                          className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${
                                            isRet 
                                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' 
                                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                          }`}
                                        >
                                          <span>⚙️ {eqName}</span>
                                          {isRet ? (
                                            <span className="text-emerald-400 font-bold flex items-center gap-0.5 ml-1">
                                              <Check className="w-3 h-3" /> Returned
                                            </span>
                                          ) : (
                                            <span className="text-amber-400/80 font-mono text-[9px] ml-1">
                                              Pending
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right align-top">
                                <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                  mapping.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  mapping.status === 'In Progress' || mapping.status === 'Event Started' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                                  mapping.status === 'Assigned' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                                  'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                }`}>
                                  {mapping.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="py-4 text-center text-zinc-500 italic text-xs font-mono">
                              No Team Members Included configured for this event.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            ))}
          </div>





        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/70 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer font-mono"
          >
            Close Details
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};


