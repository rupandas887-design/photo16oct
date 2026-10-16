import { supabaseClient } from '../supabaseClient';
import { 
  deserializeLeadEvents, 
  extractTeamMembersConfig, 
  getEventRolesForEvent, 
  parseQtyAndText, 
  convertTimeToDbFormat,
  formatISTDate,
  formatISTTime12Hour,
  processAndCompressImage
} from '../utils';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SalesTaskRequirement {
  taskId: string;
  orderId: string;
  leadId?: string;
  eventId: string;
  eventName: string;
  eventType: string;
  customEventName?: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndDate?: string;
  eventEndTime?: string;
  reportingDate?: string;
  reportingTime?: string;
  location?: string;
  roleName: string;
  roleSlug: string;
  slotNumber: number; // 1-indexed: 1, 2, 3...
  totalQtyForRole: number;
}

export interface OperationsSlotAllocation {
  id: string; // Slot ID or Assignment ID (e.g. ASST-... or slot identifier)
  assignment_id?: string;
  task_id: string;
  order_id: string;
  lead_id?: string;
  event_id: string;
  event_name: string;
  event_date?: string;
  reporting_date?: string;
  reporting_time?: string;
  staff_role: string;
  slot_number: number;
  slot_key?: string;
  staff_id: string;
  staff_name: string;
  staff_type: 'In-House' | 'Freelancer';
  mobile: string;
  equipment: string[];
  equipment_received_photo?: string | null;
  equipment_handover_photo?: string | null;
  equipment_handover_to?: string | null;
  equipment_handover_notes?: string | null;
  event_start_photo?: string | null;
  event_start_time?: string | null;
  event_end_photo?: string | null;
  event_end_time?: string | null;
  raw_footage_link?: string | null;
  task_status?: string;
  assignment_status?: string;
  updated_at?: string;
  updated_by?: string;
}

export interface EventAllocationGroup {
  eventId: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  eventStartTime: string;
  eventEndDate: string;
  eventEndTime: string;
  reportingDate: string;
  reportingTime: string;
  location: string;
  staff: OperationsSlotAllocation[];
  equipment: string[];
}

export interface EquipmentVerificationData {
  assignmentId: string;
  staffName: string;
  staffRole?: string;
  eventId?: string;
  eventName?: string;
  assignedEquipment: string[];
  equipmentReceivedPhoto: string | null;
  equipmentReceivedDate: string | null;
  equipmentReceivedTime: string | null;
  equipmentHandoverPhoto: string | null;
  equipmentHandoverDate: string | null;
  equipmentHandoverTime: string | null;
  equipmentHandoverTo: string | null;
  taskStatus: string;
}

export interface EventImagesData {
  assignmentId: string;
  staffName: string;
  staffRole?: string;
  eventId?: string;
  eventName?: string;
  eventStartPhoto: string | null;
  eventStartDate: string | null;
  eventStartTime: string | null;
  eventEndPhoto: string | null;
  eventEndDate: string | null;
  eventEndTime: string | null;
  taskStatus: string;
}

export interface RawFootageData {
  assignmentId: string;
  orderId: string;
  eventId?: string;
  eventName?: string;
  staffName: string;
  staffRole?: string;
  rawFootageLink: string | null;
  link?: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

// ============================================================================
// Helper Utilities
// ============================================================================

export function sanitizeSlug(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'role';
}

export function getDeterministicRoleSlug(roleName: string, maxLen: number = 12): string {
  const cleanRole = (roleName || 'role').replace(/[\uFEFF]+/g, '').trim();
  const slug = sanitizeSlug(cleanRole);
  if (slug.length <= maxLen) return slug;

  // Compute a deterministic 4-character hash of the full slug to guarantee uniqueness
  let hash = 5381;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) + hash) + slug.charCodeAt(i);
    hash = hash & hash;
  }
  const hashStr = Math.abs(hash).toString(36).slice(0, 4);
  const prefixLen = Math.max(1, maxLen - 5);
  return `${slug.slice(0, prefixLen)}_${hashStr}`;
}

export function getEventRolePadding(eventIndex: number, slotNumber: number): string {
  // Use ZERO WIDTH NO-BREAK SPACE (\uFEFF) which is completely invisible
  // and is natively stripped by String.prototype.trim()
  return '\uFEFF'.repeat((Math.max(0, eventIndex) * 5) + (slotNumber || 1));
}

export function generateDeterministicTaskId(orderId: string, eventId: string, roleName: string, slotNumber: number): string {
  const cleanOrder = (orderId || 'ORD').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
  const cleanEvent = (eventId || 'ev').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 10);
  const roleSlug = getDeterministicRoleSlug(roleName, 12);
  const sNum = Math.max(1, Number(slotNumber || 1));
  const rawId = `TASK_${cleanOrder}_${cleanEvent}_${roleSlug}_s${sNum}`;
  return rawId.length > 50 ? rawId.slice(0, 50) : rawId;
}

export function generateDeterministicAssignmentId(orderId: string, eventId: string, roleName: string, slotNumber: number): string {
  const cleanOrder = (orderId || 'ORD').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
  const cleanEvent = (eventId || 'ev').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 10);
  const roleSlug = getDeterministicRoleSlug(roleName, 12);
  const sNum = Math.max(1, Number(slotNumber || 1));
  const rawId = `ASST-${cleanOrder}-${cleanEvent}-${roleSlug}-${sNum}`;
  return rawId.length > 50 ? rawId.slice(0, 50) : rawId;
}

/**
 * Helper to determine if an Operations staff assignment task has already started.
 * Once started, its staff assignment must be strictly locked and cannot be reassigned.
 */
export function isOperationsAssignmentStarted(assignment: any): boolean {
  if (!assignment) return false;
  if (assignment.event_start_photo && String(assignment.event_start_photo).trim() !== '') return true;
  if (assignment.event_start_time && String(assignment.event_start_time).trim() !== '') return true;
  if (assignment.event_end_photo && String(assignment.event_end_photo).trim() !== '') return true;
  if (assignment.event_end_time && String(assignment.event_end_time).trim() !== '') return true;
  if (assignment.raw_footage_link && String(assignment.raw_footage_link).trim() !== '') return true;
  
  const status = String(assignment.task_status || assignment.assignment_status || '').trim();
  const startedStatuses = [
    'Event Started', 'Event Start', 'Event Complete', 'Event Completed', 'Event Ended',
    'Footage Handover', 'Verified Footage', 'Footage Handover Verified',
    'Raw Footage Received', 'Completed'
  ];
  return startedStatuses.some(s => s.toLowerCase() === status.toLowerCase());
}

/**
 * Helper to determine if a Production editor assignment task has already started.
 * Once started, its editor assignment must be strictly locked and cannot be reassigned.
 */
export function isEditorAssignmentStarted(assignment: any): boolean {
  if (!assignment) return false;
  if (assignment.server_drive_link && String(assignment.server_drive_link).trim() !== '') return true;
  if (assignment.edited_drive_link && String(assignment.edited_drive_link).trim() !== '') return true;
  if (assignment.customer_proof_url && String(assignment.customer_proof_url).trim() !== '') return true;
  if (assignment.actual_completion_date && String(assignment.actual_completion_date).trim() !== '') return true;

  const status = String(assignment.status || assignment.task_status || assignment.editing_status || '').trim();
  const startedStatuses = [
    'Editing Started', 'Editing In Progress', 'In Progress', 'Editing',
    'Internal Review', 'Internal QC Review', 'Customer Review', 'Client Review',
    'Client Review Sent', 'Ready For Review', 'Revision Required', 'Revision In Progress',
    'Revision', 'Editing Complete', 'Editing Completed', 'Completed',
    'Final Approval', 'Client Acceptance', 'Delivered', 'Project Delivered', 'Closed'
  ];
  return startedStatuses.some(s => s.toLowerCase() === status.toLowerCase());
}

/**
 * Determines whether two assignment slots represent the exact same slot.
 * Enforces strict independence so changing one slot NEVER alters another slot.
 * Strictly guarantees:
 * - Different roles within the same event NEVER match.
 * - Different slot numbers of the same role NEVER match.
 * - Different events NEVER match.
 */
export function isSameAssignmentSlot(s: any, targetSlot: any): boolean {
  if (!s || !targetSlot) return false;
  if (s === targetSlot) return true;
  if (targetSlot._original_ref && s === targetSlot._original_ref) return true;
  if (s._original_ref && targetSlot._original_ref && s._original_ref === targetSlot._original_ref) return true;

  // Strict Event Guard: If both specify event_id and they differ, they can NEVER be the same slot!
  if (s.event_id && targetSlot.event_id && String(s.event_id) !== String(targetSlot.event_id)) {
    return false;
  }

  const sRole = (s.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase();
  const tRole = (targetSlot.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase();
  const sNum = Number(s.slot_number || 1);
  const tNum = Number(targetSlot.slot_number || 1);

  // Strict Role Guard: If both have explicit roles and they differ, they can NEVER be the same slot!
  if (sRole && tRole && sRole !== tRole) {
    return false;
  }

  // Strict Slot Number Guard: If they share the same role, but have different slot numbers, NEVER match!
  if (sRole && tRole && sRole === tRole && sNum !== tNum) {
    return false;
  }

  // Exact slot_key check
  if (s.slot_key && targetSlot.slot_key && s.slot_key === targetSlot.slot_key) {
    return true;
  }

  // If same role and same slot number, it is the exact same slot!
  if (sRole && tRole && sRole === tRole && sNum === tNum) {
    return true;
  }

  // Check exact canonical assignment_id
  if (s.assignment_id && targetSlot.assignment_id && s.assignment_id === targetSlot.assignment_id) {
    return true;
  }
  // Check exact ID if not temporary
  if (s.id && targetSlot.id && s.id === targetSlot.id && !s.id.startsWith('slot_')) {
    return true;
  }
  // Check exact task_id
  if (s.task_id && targetSlot.task_id && s.task_id === targetSlot.task_id) {
    return true;
  }

  return false;
}

// ============================================================================
// 1. Sales -> Operations: Load Requirements and Task Slots
// ============================================================================

/**
 * Loads the exact event-wise team member requirements saved by Sales.
 * Handles QTY > 1 by generating independent requirement slots.
 * Guarantees that Event A requirements never merge into Event B.
 */
export function loadSalesEventRequirements(
  lead: any,
  order?: any,
  leadPkgs: any[] = []
): { events: any[]; requirements: SalesTaskRequirement[] } {
  const rawEvents = lead?.events && Array.isArray(lead.events) && lead.events.length > 0
    ? lead.events
    : (lead?.notes_special_customizations ? deserializeLeadEvents(lead.notes_special_customizations).events : []);

  const totalEvents = rawEvents.length > 0 ? rawEvents.length : 1;
  const teamConfigs = extractTeamMembersConfig(lead, leadPkgs);

  const orderId = order?.order_id || lead?.lead_id || 'ORD-0000';
  const leadId = lead?.lead_id || order?.lead_id || orderId;

  const resolvedEvents = rawEvents.length > 0
    ? rawEvents
    : [{
        id: 'default_event',
        event_name: order?.event_name || lead?.event_name || order?.event_type || lead?.event_type || 'Main Event',
        event_type: order?.event_type || lead?.event_type || 'Main Event',
        custom_event_name: order?.custom_event_name || lead?.custom_event_name,
        event_date: order?.event_date || lead?.event_date || '',
        event_start_time: order?.event_time || lead?.event_time || '',
        event_end_date: order?.event_end_date || lead?.event_end_date || '',
        event_end_time: order?.event_end_time || lead?.event_end_time || '',
        reporting_date: order?.Reporting_date || lead?.Reporting_date || order?.event_date || '',
        reporting_time: order?.reporting_time || lead?.reporting_time || '',
        event_location: order?.event_location || lead?.event_location || ''
      }];

  const requirements: SalesTaskRequirement[] = [];

  resolvedEvents.forEach((ev: any, evIdx: number) => {
    const evId = String(ev.id || ev.event_id || `ev_${evIdx}`);
    const rawEType = ev.event_type || lead?.event_type || order?.event_type || 'Main Event';
    const eventType = rawEType === 'Other' ? (ev.custom_event_type || lead?.custom_event_type || 'Other') : rawEType;

    let eventName = 'Main Event';
    if (ev.event_name === 'Other') {
      eventName = ev.custom_event_name || 'Other';
    } else if (ev.custom_event_name && ev.custom_event_name.trim() !== '') {
      eventName = ev.custom_event_name;
    } else if (ev.event_name && ev.event_name.trim() !== '') {
      eventName = ev.event_name;
    } else if (lead?.custom_event_name && lead.custom_event_name.trim() !== '') {
      eventName = lead.custom_event_name;
    } else if (lead?.event_name && lead.event_name !== 'Other' && lead.event_name.trim() !== '') {
      eventName = lead.event_name;
    } else if (order?.event_name && order.event_name !== 'Other' && order.event_name.trim() !== '') {
      eventName = order.event_name;
    } else if (eventType && eventType !== 'Main Event') {
      eventName = eventType;
    }

    const eventDate = ev.event_date || order?.event_date || lead?.event_date || '';
    const eventStartTime = ev.event_start_time || ev.event_time || order?.event_time || lead?.event_time || '';
    const eventEndDate = ev.event_end_date || ev.Event_End_Date || order?.event_end_date || lead?.event_end_date || '';
    const eventEndTime = ev.event_end_time || order?.event_end_time || '';
    const reportingDate = ev.reporting_date || ev.Reporting_date || order?.Reporting_date || lead?.Reporting_date || eventDate || '';
    const reportingTime = ev.reporting_time || order?.reporting_time || lead?.reporting_time || '';
    const location = ev.event_location || order?.event_location || lead?.event_location || '';

    // Extract roles for this specific event
    const includedRoles = getEventRolesForEvent(ev, evIdx, teamConfigs, totalEvents);

    // Group and parse quantities
    const roleQuantities: { roleName: string; qty: number }[] = [];
    includedRoles.forEach((roleStr: string) => {
      const { qty, text } = parseQtyAndText(roleStr);
      const roleName = (text || roleStr).trim();
      if (!roleName) return;
      const targetQty = qty || 1;
      const existing = roleQuantities.find(r => r.roleName.toLowerCase() === roleName.toLowerCase());
      if (existing) {
        existing.qty += targetQty;
      } else {
        roleQuantities.push({ roleName, qty: targetQty });
      }
    });

    // Generate separate task slots for each requirement
    roleQuantities.forEach(({ roleName, qty }) => {
      const roleSlug = sanitizeSlug(roleName);
      for (let slot = 1; slot <= qty; slot++) {
        const taskId = generateDeterministicTaskId(orderId, evId, roleName, slot);
        requirements.push({
          taskId,
          orderId,
          leadId,
          eventId: evId,
          eventName,
          eventType,
          customEventName: ev.custom_event_name,
          eventDate,
          eventStartTime,
          eventEndDate,
          eventEndTime,
          reportingDate,
          reportingTime,
          location,
          roleName,
          roleSlug,
          slotNumber: slot,
          totalQtyForRole: qty
        });
      }
    });
  });

  return { events: resolvedEvents, requirements };
}

// ============================================================================
// 2. Build Initial Allocations for Operations Modal
// ============================================================================

/**
 * Builds the initial event allocations state for the Operations modal.
 * Matches existing DB assignments deterministically by event_id, staff_role, and slot_number.
 * Preserves each slot's assigned staff, equipment, photos, and links without mixing data across events.
 */
export function buildInitialEventAllocations(params: {
  lead?: any;
  targetLead?: any;
  order: any;
  leadPkgs?: any[];
  targetLeadPkgs?: any[];
  existingStaffAssignments?: any[];
  staffAssignments?: any[];
  staffList?: any[];
  operationsRecord?: any;
}): Record<string, EventAllocationGroup> {
  const lead = params.lead || params.targetLead;
  const order = params.order;
  const leadPkgs = params.leadPkgs || params.targetLeadPkgs || [];
  const existingStaffAssignments = params.existingStaffAssignments || params.staffAssignments || [];
  const staffList = params.staffList || [];
  const operationsRecord = params.operationsRecord;

  const { events, requirements } = loadSalesEventRequirements(lead, order, leadPkgs);
  const orderId = order?.order_id || lead?.lead_id || '';
  const leadId = lead?.lead_id || order?.lead_id || '';

  // Filter existing staff assignments for this specific order/lead
  const orderAssignments = (existingStaffAssignments || []).filter(sa => 
    (
      (orderId && sa.order_id === orderId) || 
      (leadId && sa.order_id === leadId) ||
      (orderId && sa.lead_id === orderId) ||
      (leadId && sa.lead_id === leadId)
    ) && 
    sa.assignment_status !== 'Cancelled'
  );

  let parsedKitMapping: any[] = [];
  if (operationsRecord?.equipment_kit && typeof operationsRecord.equipment_kit === 'string') {
    try {
      const parsed = JSON.parse(operationsRecord.equipment_kit);
      if (Array.isArray(parsed)) {
        parsedKitMapping = parsed;
      }
    } catch (e) {}
  }

  const allocations: Record<string, EventAllocationGroup> = {};

  events.forEach((ev: any, evIdx: number) => {
    const evId = String(ev.id || ev.event_id || `ev_${evIdx}`);
    const evReqs = requirements.filter(r => r.eventId === evId);

    const eventName = evReqs[0]?.eventName || ev.event_name || 'Main Event';
    const eventType = evReqs[0]?.eventType || ev.event_type || 'Main Event';
    const eventDate = ev.event_date || order?.event_date || lead?.event_date || '';
    const eventStartTime = ev.event_start_time || ev.event_time || order?.event_time || '';
    const eventEndDate = ev.event_end_date || order?.event_end_date || '';
    const eventEndTime = ev.event_end_time || order?.event_end_time || '';
    const reportingDate = ev.reporting_date || lead?.Reporting_date || eventDate || '';
    const reportingTime = ev.reporting_time || operationsRecord?.reporting_time || order?.reporting_time || '';
    const location = ev.event_location || order?.event_location || '';

    // Build set of other event identifiers in this order to prevent cross-event leakage
    const otherEventIds = new Set(
      events
        .filter((_, oIdx) => oIdx !== evIdx)
        .flatMap((oe, oIdx) => [
          String(oe.id || oe.event_id || `ev_${oIdx}`),
          oe.id ? String(oe.id) : '',
          oe.event_id ? String(oe.event_id) : '',
          `ev_${oIdx}`
        ])
        .filter(Boolean)
    );

    // Find DB assignments that match this event strictly
    const eventDbAssignments = orderAssignments.filter(sa => {
      const saEvId = sa.event_id ? String(sa.event_id) : '';

      // If assignment has an event_id:
      if (saEvId) {
        // If it belongs to another event in this order, strictly reject!
        if (otherEventIds.has(saEvId)) return false;
        // If it matches this event's ID:
        if (
          saEvId === evId || 
          (ev.id && saEvId === String(ev.id)) || 
          (ev.event_id && saEvId === String(ev.event_id)) || 
          saEvId === `ev_${evIdx}` ||
          saEvId === `ev-${evIdx + 1}`
        ) {
          return true;
        }
      }

      // Check deterministic task_id / assignment_id if present
      if (sa.assignment_id && (
        sa.assignment_id.includes(`-${evId}-`) || 
        (ev.id && sa.assignment_id.includes(`-${ev.id}-`)) ||
        sa.assignment_id.includes(`-ev-${evIdx + 1}-`) ||
        sa.assignment_id.includes(`-ev_${evIdx}-`)
      )) {
        return true;
      }
      if (sa.task_id && (
        sa.task_id.includes(`_${evId}_`) || 
        (ev.id && sa.task_id.includes(`_${ev.id}_`)) ||
        sa.task_id.includes(`_ev-${evIdx + 1}_`) ||
        sa.task_id.includes(`_ev_${evIdx}_`)
      )) {
        return true;
      }

      // If single event order, unmapped assignments belong to this single event
      if (events.length === 1) return true;

      // If multiple events and sa has NO event_id or placeholder 'ev'/'general':
      if (!saEvId || saEvId === 'ev' || saEvId === 'general') {
        if (sa.event_name) {
          const saNameLower = sa.event_name.trim().toLowerCase();
          const thisEvNameLower = (eventName || ev.event_name || ev.event_type || '').trim().toLowerCase();
          const matchesThis = saNameLower === thisEvNameLower;
          const matchesOther = events.some((oe, oIdx) => {
            if (oIdx === evIdx) return false;
            return (oe.event_name || oe.event_type || '').trim().toLowerCase() === saNameLower;
          });
          if (matchesThis && !matchesOther) return true;
        }
      }

      return false;
    });

    const usedDbAssignmentIds = new Set<string>();
    const slotAllocations: OperationsSlotAllocation[] = [];

    // Map each Sales requirement to an assignment slot
    evReqs.forEach(req => {
      const canonicalSlotAssignId = generateDeterministicAssignmentId(orderId, evId, req.roleName, req.slotNumber);

      // Find matching existing assignment:
      // 1. By exact task_id or exact canonical assignment_id
      let matchedSa = eventDbAssignments.find(sa => 
        !usedDbAssignmentIds.has(sa.assignment_id) &&
        (
          sa.task_id === req.taskId || 
          sa.assignment_id === canonicalSlotAssignId ||
          (sa.assignment_id && sa.assignment_id === req.taskId)
        )
      );

      // 2. By event_id + matching role + matching slot_number
      if (!matchedSa) {
        matchedSa = eventDbAssignments.find(sa => 
          !usedDbAssignmentIds.has(sa.assignment_id) &&
          (sa.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase() === req.roleName.trim().toLowerCase() &&
          Number(sa.slot_number || 1) === req.slotNumber
        );
      }

      // 3. Fallback for legacy assignments that have NO slot_number and NO task_id:
      // ONLY allow matching slot 1 if the DB record has NO slot_number specified!
      // NEVER allow slot 1 to steal slot 2's record or vice versa!
      if (!matchedSa && req.slotNumber === 1) {
        matchedSa = eventDbAssignments.find(sa => 
          !usedDbAssignmentIds.has(sa.assignment_id) &&
          (sa.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase() === req.roleName.trim().toLowerCase() &&
          (sa.slot_number === undefined || sa.slot_number === null || Number(sa.slot_number) === 1)
        );
      }

      if (matchedSa) {
        usedDbAssignmentIds.add(matchedSa.assignment_id);
      }

      const assignedStaffName = matchedSa?.staff_name || '';
      const st = staffList?.find(s => s.name?.toLowerCase() === assignedStaffName.toLowerCase());
      const stType = matchedSa?.staff_type || st?.staff_type || (st as any)?.Staff_Type || 'In-House';
      const cleanType = (stType === 'Freelancer' || stType === 'freelancer') ? 'Freelancer' : 'In-House';

      const canonicalAssignmentId = matchedSa?.assignment_id || generateDeterministicAssignmentId(orderId, evId, req.roleName, req.slotNumber);

      // Parse equipment strictly for this slot
      let slotEq: string[] = [];
      if (matchedSa) {
        if (Array.isArray(matchedSa.equipment) && matchedSa.equipment.length > 0) {
          slotEq = matchedSa.equipment;
        } else if (typeof matchedSa.equipment === 'string' && matchedSa.equipment.trim()) {
          try {
            const parsed = JSON.parse(matchedSa.equipment);
            slotEq = Array.isArray(parsed) ? parsed : [matchedSa.equipment];
          } catch (e) {
            slotEq = matchedSa.equipment.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        } else if (typeof matchedSa.assigned_equipment === 'string' && matchedSa.assigned_equipment.trim()) {
          slotEq = matchedSa.assigned_equipment.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      if (slotEq.length === 0 && parsedKitMapping.length > 0) {
        const kitMatch = parsedKitMapping.find((km: any) => 
          (km.assignment_id && matchedSa && km.assignment_id === matchedSa.assignment_id) ||
          (km.event_id === evId && assignedStaffName && km.staff_name && km.staff_name.trim().toLowerCase() === assignedStaffName.trim().toLowerCase())
        );
        if (kitMatch && Array.isArray(kitMatch.equipment)) {
          slotEq = kitMatch.equipment;
        }
      }

      slotAllocations.push({
        id: canonicalAssignmentId,
        assignment_id: canonicalAssignmentId,
        task_id: req.taskId,
        order_id: orderId,
        lead_id: req.leadId,
        event_id: evId,
        event_name: eventName,
        event_date: eventDate,
        reporting_date: reportingDate,
        reporting_time: reportingTime,
        staff_role: req.roleName.trim() + getEventRolePadding(evIdx, req.slotNumber),
        slot_number: req.slotNumber,
        slot_key: `${evId}__${(req.roleName || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase()}__s${req.slotNumber}`,
        staff_id: matchedSa?.staff_id || st?.staff_id || (assignedStaffName ? 'STF-0000' : ''),
        staff_name: assignedStaffName,
        staff_type: cleanType,
        mobile: matchedSa?.mobile || st?.mobile || st?.phone || '',
        equipment: slotEq,
        equipment_received_photo: matchedSa?.equipment_received_photo || null,
        equipment_handover_photo: matchedSa?.equipment_handover_photo || null,
        equipment_handover_to: matchedSa?.equipment_handover_to || null,
        equipment_handover_notes: matchedSa?.equipment_handover_notes || null,
        event_start_photo: matchedSa?.event_start_photo || null,
        event_start_time: matchedSa?.event_start_time || null,
        event_end_photo: matchedSa?.event_end_photo || null,
        event_end_time: matchedSa?.event_end_time || null,
        raw_footage_link: matchedSa?.raw_footage_link || null,
        task_status: matchedSa?.task_status || 'Pending',
        assignment_status: matchedSa?.assignment_status || 'Assigned',
        updated_at: matchedSa?.updated_at,
        updated_by: matchedSa?.updated_by
      });
    });

    allocations[evId] = {
      eventId: evId,
      eventName,
      eventType,
      eventDate,
      eventStartTime,
      eventEndDate,
      eventEndTime,
      reportingDate,
      reportingTime,
      location,
      staff: slotAllocations,
      equipment: Array.from(new Set(slotAllocations.flatMap(s => s.equipment || [])))
    };
  });

  return allocations;
}

// ============================================================================
// 3. Supabase Storage: Persistent Image Upload Helper
// ============================================================================

/**
 * Uploads a proof photo (Equipment Received, Equipment Handover, Event Start, Event End)
 * to Supabase Storage at: operations/{assignment_id}/{category}/{filename}.
 * Returns the permanent public URL.
 */
export async function uploadProofImage(params: {
  assignmentId: string;
  category: 'equipment-received' | 'equipment-handover' | 'event-start' | 'event-end';
  photoInput: File | Blob | string;
  customFilename?: string;
}): Promise<string> {
  const { assignmentId, category, photoInput, customFilename } = params;

  if (!assignmentId || !assignmentId.trim()) {
    throw new Error('Assignment ID is required for photo upload.');
  }

  // If already a remote URL, return it
  if (typeof photoInput === 'string') {
    const trimmed = photoInput.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }

  let blob: Blob;
  let contentType = 'image/jpeg';
  let base64DataUri: string | null = null;

  try {
    const processed = await processAndCompressImage(photoInput);
    blob = processed.blob;
    contentType = processed.contentType || 'image/jpeg';
    base64DataUri = processed.dataUrl;
  } catch (procErr) {
    console.warn('[OperationsService] Image processing fallback:', procErr);
    if (photoInput instanceof File || photoInput instanceof Blob) {
      blob = photoInput;
      contentType = photoInput.type || 'image/jpeg';
    } else if (typeof photoInput === 'string' && photoInput.trim().startsWith('data:')) {
      base64DataUri = photoInput.trim();
      const parts = base64DataUri.split(';base64,');
      contentType = parts[0].replace('data:', '') || 'image/jpeg';
      const byteCharacters = atob(parts[1] || '');
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }
      blob = new Blob(byteArrays, { type: contentType });
    } else {
      throw new Error('Invalid image input format. Must be File, Blob, or base64 data URI.');
    }
  }

  const cleanAssignId = assignmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const fname = customFilename || `proof_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
  const storagePath = `${cleanAssignId}/${category}/${fname}`;

  // 1. Try Direct Client Upload to 'img' bucket first (publicly accessible)
  if (supabaseClient) {
    try {
      const imgPath = `proofs/ops_${cleanAssignId}_${category}_${fname}`;
      const { data, error } = await supabaseClient.storage
        .from('img')
        .upload(imgPath, blob, {
          contentType,
          upsert: true
        });

      if (!error && data) {
        const { data: publicData } = supabaseClient.storage
          .from('img')
          .getPublicUrl(data.path || imgPath);

        if (publicData?.publicUrl) {
          console.log('[OperationsService] Uploaded directly to Supabase storage:', publicData.publicUrl);
          return publicData.publicUrl;
        }
      } else if (error) {
        console.warn('[OperationsService] Direct storage upload warning:', error.message || error);
      }
    } catch (directErr) {
      console.warn('[OperationsService] Direct storage upload exception:', directErr);
    }
  }

  // 2. Server Proxy Upload fallback via /api/upload-proof (Admin with service role)
  if (base64DataUri) {
    try {
      const resp = await fetch('/api/upload-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: base64DataUri,
          fileName: `proofs/ops_${cleanAssignId}_${category}_${fname}`,
          contentType,
          bucketName: 'img'
        })
      });
      const resData = await resp.json();
      if (resData.success && resData.publicUrl) {
        console.log('[OperationsService] Uploaded successfully via server proxy:', resData.publicUrl);
        return resData.publicUrl;
      }
    } catch (proxyErr) {
      console.error('[OperationsService] Server proxy upload error:', proxyErr);
    }
  }

  // 3. Fallback to base64 Data URI if network storage fails
  if (base64DataUri) {
    console.warn('[OperationsService] Storage upload failed; falling back to Data URI');
    return base64DataUri;
  }

  throw new Error('Failed to upload proof image to Supabase Storage.');
}

// ============================================================================
// 4. Operations Service Methods: Discrete Single-Assignment Actions
// ============================================================================

/**
 * Uploads Equipment Received image for a specific assignment.
 * Updates ONLY equipment_received_photo for that exact assignment_id.
 */
export async function uploadEquipmentReceived(params: {
  assignmentId: string;
  orderId: string;
  leadId?: string;
  eventId?: string;
  eventName?: string;
  staffName: string;
  photoInput: File | Blob | string;
  remarks?: string;
  updatedBy?: string;
  pushUpdateFn?: (table: string, matchCol: string, matchVal: string, updates: any) => Promise<any>;
  pushInsertFn?: (table: string, payload: any) => Promise<any>;
}): Promise<{ success: boolean; photoUrl: string }> {
  const { assignmentId, orderId, leadId, eventId, eventName, staffName, photoInput, remarks, updatedBy, pushUpdateFn, pushInsertFn } = params;
  const timestamp = new Date().toISOString();

  // 1. Upload to Supabase Storage
  const photoUrl = await uploadProofImage({
    assignmentId,
    category: 'equipment-received',
    photoInput
  });

  // Preserve existing proofs to prevent overwriting handover time
  let existingProofs: any = {};
  try {
    const { data: saRow } = await supabaseClient
      .from('staff_assignments')
      .select('proofs')
      .eq('assignment_id', assignmentId)
      .maybeSingle();
    if (saRow?.proofs) {
      existingProofs = typeof saRow.proofs === 'string' ? JSON.parse(saRow.proofs) : saRow.proofs;
    }
  } catch (e) {}

  const updatedProofs = {
    ...existingProofs,
    equipment_received_photo: photoUrl,
    equipment_received_time: timestamp,
    equipment_received_date: timestamp.split('T')[0]
  };

  // 2. Update staff_assignments row
  const updatePayload: any = {
    equipment_received_photo: photoUrl,
    assignment_status: 'Assigned',
    updated_at: timestamp,
    updated_by: updatedBy || staffName,
    proofs: updatedProofs
  };

  if (pushUpdateFn) {
    await pushUpdateFn('staff_assignments', 'assignment_id', assignmentId, updatePayload);
  } else if (supabaseClient) {
    await supabaseClient
      .from('staff_assignments')
      .update(updatePayload)
      .eq('assignment_id', assignmentId);
  }

  // 3. Record audit trail in lead_equipment_history and staff_task_submissions
  try {
    const historyPayload = {
      order_id: orderId,
      lead_id: leadId || orderId,
      assignment_id: assignmentId,
      event_id: eventId || null,
      event_name: eventName || null,
      equipment_name: 'Equipment Received Proof',
      equipment_status: 'Equipment Received',
      proof_type: 'Equipment Received',
      photo_url: photoUrl,
      returned_by: staffName,
      returned_at: timestamp,
      created_at: timestamp,
      remarks: JSON.stringify({
        assignment_id: assignmentId,
        proof_type: 'Equipment Received',
        staff_name: staffName,
        photo_url: photoUrl,
        uploaded_at: timestamp,
        uploaded_by: staffName,
        remarks: remarks || `Equipment Received proof uploaded by ${staffName}`
      })
    };
    if (pushInsertFn) {
      await pushInsertFn('lead_equipment_history', historyPayload);
    } else if (supabaseClient) {
      await supabaseClient.from('lead_equipment_history').insert([historyPayload]);
    }
  } catch (err) {
    console.warn('[OperationsService] lead_equipment_history insert note:', err);
  }

  return { success: true, photoUrl };
}

/**
 * Uploads Equipment Handover image for a specific assignment.
 * Updates ONLY equipment_handover_photo for that exact assignment_id.
 * NEVER overwrites or falls back to equipment_received_photo.
 */
export async function uploadEquipmentHandover(params: {
  assignmentId: string;
  orderId: string;
  leadId?: string;
  eventId?: string;
  eventName?: string;
  staffName: string;
  photoInput: File | Blob | string;
  handoverTo?: string;
  handoverNotes?: string;
  updatedBy?: string;
  pushUpdateFn?: (table: string, matchCol: string, matchVal: string, updates: any) => Promise<any>;
  pushInsertFn?: (table: string, payload: any) => Promise<any>;
}): Promise<{ success: boolean; photoUrl: string }> {
  const { assignmentId, orderId, leadId, eventId, eventName, staffName, photoInput, handoverTo, handoverNotes, updatedBy, pushUpdateFn, pushInsertFn } = params;
  const timestamp = new Date().toISOString();

  // 1. Upload to Supabase Storage
  const photoUrl = await uploadProofImage({
    assignmentId,
    category: 'equipment-handover',
    photoInput
  });

  // Preserve existing proofs to prevent overwriting received time
  let existingProofs: any = {};
  try {
    const { data: saRow } = await supabaseClient
      .from('staff_assignments')
      .select('proofs')
      .eq('assignment_id', assignmentId)
      .maybeSingle();
    if (saRow?.proofs) {
      existingProofs = typeof saRow.proofs === 'string' ? JSON.parse(saRow.proofs) : saRow.proofs;
    }
  } catch (e) {}

  const updatedProofs = {
    ...existingProofs,
    equipment_handover_photo: photoUrl,
    equipment_handover_time: timestamp,
    equipment_handover_date: timestamp.split('T')[0]
  };

  // 2. Update staff_assignments row
  const updatePayload: any = {
    equipment_handover_photo: photoUrl,
    equipment_handover_to: handoverTo || staffName,
    equipment_handover_notes: handoverNotes || null,
    updated_at: timestamp,
    updated_by: updatedBy || staffName,
    proofs: updatedProofs
  };

  if (pushUpdateFn) {
    await pushUpdateFn('staff_assignments', 'assignment_id', assignmentId, updatePayload);
  } else if (supabaseClient) {
    await supabaseClient
      .from('staff_assignments')
      .update(updatePayload)
      .eq('assignment_id', assignmentId);
  }

  // 3. Record audit trail in lead_equipment_history
  try {
    const historyPayload = {
      order_id: orderId,
      lead_id: leadId || orderId,
      assignment_id: assignmentId,
      event_id: eventId || null,
      event_name: eventName || null,
      equipment_name: 'Equipment Handover Proof',
      equipment_status: 'Equipment Handover Completed',
      proof_type: 'Equipment Handover',
      photo_url: photoUrl,
      returned_by: staffName,
      returned_at: timestamp,
      created_at: timestamp,
      remarks: JSON.stringify({
        assignment_id: assignmentId,
        proof_type: 'Equipment Handover',
        staff_name: staffName,
        photo_url: photoUrl,
        uploaded_at: timestamp,
        uploaded_by: staffName,
        remarks: handoverNotes || `Equipment Handover to ${handoverTo || staffName} proof uploaded by ${staffName}`
      })
    };
    if (pushInsertFn) {
      await pushInsertFn('lead_equipment_history', historyPayload);
    } else if (supabaseClient) {
      await supabaseClient.from('lead_equipment_history').insert([historyPayload]);
    }
  } catch (err) {
    console.warn('[OperationsService] lead_equipment_history handover insert note:', err);
  }

  return { success: true, photoUrl };
}

/**
 * Uploads Event Start photo for a specific assignment.
 * Updates ONLY event_start_photo and event_start_time for that exact assignment_id.
 */
export async function uploadEventStart(params: {
  assignmentId: string;
  orderId: string;
  eventId?: string;
  eventName?: string;
  staffName: string;
  photoInput: File | Blob | string;
  remarks?: string;
  updatedBy?: string;
  pushUpdateFn?: (table: string, matchCol: string, matchVal: string, updates: any) => Promise<any>;
  pushInsertFn?: (table: string, payload: any) => Promise<any>;
}): Promise<{ success: boolean; photoUrl: string }> {
  const { assignmentId, orderId, eventId, eventName, staffName, photoInput, remarks, updatedBy, pushUpdateFn, pushInsertFn } = params;
  const timestamp = new Date().toISOString();

  // 1. Upload to Supabase Storage
  const photoUrl = await uploadProofImage({
    assignmentId,
    category: 'event-start',
    photoInput
  });

  // 2. Update staff_assignments row ONLY
  const updatePayload = {
    event_start_photo: photoUrl,
    event_start_time: timestamp,
    task_status: 'Event Started',
    updated_at: timestamp,
    updated_by: updatedBy || staffName
  };

  if (pushUpdateFn) {
    await pushUpdateFn('staff_assignments', 'assignment_id', assignmentId, updatePayload);
  } else if (supabaseClient) {
    await supabaseClient
      .from('staff_assignments')
      .update(updatePayload)
      .eq('assignment_id', assignmentId);
  }

  return { success: true, photoUrl };
}

/**
 * Uploads Event Complete / End photo for a specific assignment.
 * Updates ONLY event_end_photo and event_end_time for that exact assignment_id.
 */
export async function uploadEventEnd(params: {
  assignmentId: string;
  orderId: string;
  eventId?: string;
  eventName?: string;
  staffName: string;
  photoInput: File | Blob | string;
  remarks?: string;
  updatedBy?: string;
  pushUpdateFn?: (table: string, matchCol: string, matchVal: string, updates: any) => Promise<any>;
  pushInsertFn?: (table: string, payload: any) => Promise<any>;
}): Promise<{ success: boolean; photoUrl: string }> {
  const { assignmentId, orderId, eventId, eventName, staffName, photoInput, remarks, updatedBy, pushUpdateFn, pushInsertFn } = params;
  const timestamp = new Date().toISOString();

  // 1. Upload to Supabase Storage
  const photoUrl = await uploadProofImage({
    assignmentId,
    category: 'event-end',
    photoInput
  });

  // 2. Update staff_assignments row ONLY
  const updatePayload = {
    event_end_photo: photoUrl,
    event_end_time: timestamp,
    task_status: 'Event Completed',
    updated_at: timestamp,
    updated_by: updatedBy || staffName
  };

  if (pushUpdateFn) {
    await pushUpdateFn('staff_assignments', 'assignment_id', assignmentId, updatePayload);
  } else if (supabaseClient) {
    await supabaseClient
      .from('staff_assignments')
      .update(updatePayload)
      .eq('assignment_id', assignmentId);
  }

  return { success: true, photoUrl };
}

/**
 * Uploads/Saves Raw Footage Link for a specific assignment.
 * Saves ONLY for that exact assignment_id. Never spills into other tasks or events.
 */
export async function uploadRawFootage(params: {
  assignmentId: string;
  orderId: string;
  eventId?: string;
  eventName?: string;
  staffName: string;
  rawFootageLink: string;
  updatedBy?: string;
  pushUpdateFn?: (table: string, matchCol: string, matchVal: string, updates: any) => Promise<any>;
  pushInsertFn?: (table: string, payload: any) => Promise<any>;
  rawFootageList?: any[];
}): Promise<{ success: boolean }> {
  const { assignmentId, orderId, eventId, eventName, staffName, rawFootageLink, updatedBy, pushUpdateFn, pushInsertFn, rawFootageList = [] } = params;
  const timestamp = new Date().toISOString();
  const cleanLink = (rawFootageLink || '').trim();

  // Upsert strictly in raw_footage table matching assignment_id
  try {
    const existingRf = rawFootageList.find(rf => assignmentId && rf.assignment_id === assignmentId);
    const rfTrackingId = existingRf?.tracking_id || `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const rfPayload = {
      tracking_id: rfTrackingId,
      order_id: orderId,
      assignment_id: assignmentId || null,
      event_id: eventId || null,
      event_name: eventName || null,
      server_path: cleanLink,
      drive_link: cleanLink,
      uploaded_by: staffName,
      uploaded_date: timestamp,
      raw_received: Boolean(cleanLink),
      status: cleanLink ? 'Received' : 'Pending'
    };

    if (existingRf && pushUpdateFn) {
      await pushUpdateFn('raw_footage', 'tracking_id', existingRf.tracking_id, rfPayload);
    } else if (pushInsertFn) {
      await pushInsertFn('raw_footage', rfPayload);
    } else if (supabaseClient) {
      if (existingRf?.tracking_id) {
        await supabaseClient
          .from('raw_footage')
          .update(rfPayload)
          .eq('tracking_id', existingRf.tracking_id);
      } else {
        await supabaseClient
          .from('raw_footage')
          .insert([rfPayload]);
      }
    }
  } catch (rfErr) {
    console.warn('[OperationsService] raw_footage upsert note:', rfErr);
  }

  return { success: true };
}

// ============================================================================
// 5. Query Resolvers: Single Source of Truth for Modals and UI
// ============================================================================

// Helper to extract timestamp from a storage URL if present (e.g. ..._1789472717871.jpg)
function extractTimestampFromUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/_(\d{12,14})\./);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 1000000000000 && num < 4000000000000) {
      return new Date(num).toISOString();
    }
  }
  return null;
}

/**
 * Resolves Equipment Verification data strictly from assignment_id.
 * Equipment Handover will NEVER display Equipment Received image as fallback.
 * Each upload maintains its own independent upload timestamp.
 */
export function getEquipmentVerificationData(params: {
  assignmentId?: string;
  orderId?: string;
  eventId?: string;
  staffName: string;
  staffAssignment?: any;
  staffAssignments?: any[];
  leadEquipmentHistory?: any[];
}): EquipmentVerificationData {
  const { assignmentId, orderId, eventId, staffName, staffAssignment, staffAssignments = [], leadEquipmentHistory = [] } = params;

  // 1. Match exact assignment from staffAssignments or staffAssignment param
  let sa = staffAssignment || (assignmentId ? staffAssignments.find(s => s.assignment_id === assignmentId) : null);
  if (!sa && assignmentId && staffAssignments.length > 0) {
    sa = staffAssignments.find(s => s.assignment_id === assignmentId);
  }
  if (!sa && orderId) {
    sa = staffAssignments.find(s => 
      s.order_id === orderId && 
      (!eventId || s.event_id === eventId) &&
      (s.staff_name || '').trim().toLowerCase() === (staffName || '').trim().toLowerCase()
    );
  }

  const assignedEq: string[] = sa?.equipment && Array.isArray(sa.equipment)
    ? sa.equipment
    : (typeof sa?.equipment === 'string' ? sa.equipment.split(',').map((s: string) => s.trim()).filter(Boolean) : []);

  let recPhoto = sa?.equipment_received_photo || null;
  let handPhoto = sa?.equipment_handover_photo || null;

  let proofsObj: any = {};
  if (sa?.proofs) {
    try {
      proofsObj = typeof sa.proofs === 'string' ? JSON.parse(sa.proofs) : sa.proofs;
    } catch (e) {}
  }

  let recTimestamp: string | null = null;
  let handTimestamp: string | null = null;

  // 2. Check lead_equipment_history strictly for matching assignment_id or matching (order_id + event_id + staff)
  const matchingHistory = leadEquipmentHistory.filter(h => {
    let parsed: any = {};
    if (h.remarks) {
      try { parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks; } catch (e) {}
    }
    const hAssignmentId = h.assignment_id || parsed.assignment_id;
    if (assignmentId && hAssignmentId) {
      return hAssignmentId === assignmentId;
    }
    if (orderId && h.order_id === orderId) {
      if (eventId && h.event_id && h.event_id !== eventId) return false;
      const retBy = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
      const stNorm = (staffName || '').trim().toLowerCase();
      if (retBy && stNorm && (retBy === stNorm || retBy.includes(stNorm) || stNorm.includes(retBy))) return true;
    }
    return false;
  });

  const parsedHistory = matchingHistory.map(h => {
    let parsed: any = {};
    if (h.remarks) {
      try { parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks; } catch (e) {}
    }
    const pType = (parsed.proof_type || h.proof_type || h.equipment_name || h.equipment_status || '').toLowerCase();
    const hUrl = h.photo_url || parsed.photo_url || null;
    const hTime = parsed.uploaded_at || h.returned_at || h.created_at || extractTimestampFromUrl(hUrl);
    const isRec = pType.includes('received') || pType.includes('asset collection') || pType.includes('asset_collection') || pType.includes('collection') || pType === 'equipment received';
    const isHand = pType.includes('handover') || pType.includes('asset return') || pType.includes('asset_return') || pType.includes('return') || pType === 'equipment handover';
    return { parsed, pType, hUrl, hTime, isRec, isHand, raw: h };
  });

  // A. RESOLVE EQUIPMENT RECEIVED TIMESTAMP
  // 1) From proofs JSON if exact photo matches or no photo specified
  if (proofsObj.equipment_received_time && (!proofsObj.equipment_received_photo || proofsObj.equipment_received_photo === recPhoto)) {
    recTimestamp = proofsObj.equipment_received_time;
  }
  // 2) From exact photo URL match in history
  if (!recTimestamp && recPhoto) {
    const exactMatch = parsedHistory.find(p => p.isRec && p.hUrl === recPhoto && p.hTime);
    if (exactMatch) {
      recTimestamp = exactMatch.hTime;
    }
  }
  // 3) From most recent received record in history
  if (!recTimestamp) {
    const recHistory = parsedHistory.filter(p => p.isRec && (p.hUrl || p.hTime));
    recHistory.sort((a, b) => new Date(b.hTime || 0).getTime() - new Date(a.hTime || 0).getTime());
    if (recHistory[0]) {
      if (!recPhoto && recHistory[0].hUrl) recPhoto = recHistory[0].hUrl;
      if (recHistory[0].hTime) recTimestamp = recHistory[0].hTime;
    }
  }
  // 4) Extract from photo URL if it contains a timestamp
  if (!recTimestamp && recPhoto) {
    recTimestamp = extractTimestampFromUrl(recPhoto);
  }
  // 5) Direct column fallback on sa if present
  if (!recTimestamp && (sa as any)?.equipment_received_time) {
    recTimestamp = (sa as any).equipment_received_time;
  }

  // B. RESOLVE EQUIPMENT HANDOVER TIMESTAMP
  // 1) From proofs JSON if exact photo matches or no photo specified
  if (proofsObj.equipment_handover_time && (!proofsObj.equipment_handover_photo || proofsObj.equipment_handover_photo === handPhoto)) {
    handTimestamp = proofsObj.equipment_handover_time;
  }
  // 2) From exact photo URL match in history
  if (!handTimestamp && handPhoto) {
    const exactMatch = parsedHistory.find(p => p.isHand && p.hUrl === handPhoto && p.hTime);
    if (exactMatch) {
      handTimestamp = exactMatch.hTime;
    }
  }
  // 3) From most recent handover record in history
  if (!handTimestamp) {
    const handHistory = parsedHistory.filter(p => p.isHand && (p.hUrl || p.hTime));
    handHistory.sort((a, b) => new Date(b.hTime || 0).getTime() - new Date(a.hTime || 0).getTime());
    if (handHistory[0]) {
      if (!handPhoto && handHistory[0].hUrl) handPhoto = handHistory[0].hUrl;
      if (handHistory[0].hTime) handTimestamp = handHistory[0].hTime;
    }
  }
  // 4) Extract from photo URL if it contains a timestamp
  if (!handTimestamp && handPhoto) {
    handTimestamp = extractTimestampFromUrl(handPhoto);
  }
  // 5) Direct column fallback on sa if present
  if (!handTimestamp && (sa as any)?.equipment_handover_time) {
    handTimestamp = (sa as any).equipment_handover_time;
  }

  // FORMAT IN APPLICATION'S STANDARD IST FORMAT
  const recDate = recTimestamp ? formatISTDate(recTimestamp) : null;
  const recTime = recTimestamp ? formatISTTime12Hour(recTimestamp) : null;
  const handDate = handTimestamp ? formatISTDate(handTimestamp) : null;
  const handTime = handTimestamp ? formatISTTime12Hour(handTimestamp) : null;

  return {
    assignmentId: assignmentId || sa?.assignment_id || 'UNKNOWN',
    staffName: sa?.staff_name || staffName,
    staffRole: sa?.staff_role,
    eventId: sa?.event_id || eventId,
    eventName: sa?.event_name,
    assignedEquipment: assignedEq,
    equipmentReceivedPhoto: recPhoto,
    equipmentReceivedDate: recDate,
    equipmentReceivedTime: recTime,
    equipmentHandoverPhoto: handPhoto,
    equipmentHandoverDate: handDate,
    equipmentHandoverTime: handTime,
    equipmentHandoverTo: sa?.equipment_handover_to || null,
    taskStatus: sa?.task_status || 'Pending'
  };
}

/**
 * Resolves Event Start & Event Complete images strictly from assignment_id.
 */
export function getEventImagesData(params: {
  assignmentId?: string;
  orderId?: string;
  eventId?: string;
  staffName: string;
  staffAssignment?: any;
  staffAssignments?: any[];
  leadEquipmentHistory?: any[];
}): EventImagesData {
  const { assignmentId, orderId, eventId, staffName, staffAssignment, staffAssignments = [], leadEquipmentHistory = [] } = params;

  let sa = staffAssignment || (assignmentId ? staffAssignments.find(s => s.assignment_id === assignmentId) : null);
  if (!sa && assignmentId && staffAssignments.length > 0) {
    sa = staffAssignments.find(s => s.assignment_id === assignmentId);
  }
  if (!sa && orderId) {
    sa = staffAssignments.find(s => 
      s.order_id === orderId && 
      (!eventId || s.event_id === eventId) &&
      (s.staff_name || '').trim().toLowerCase() === (staffName || '').trim().toLowerCase()
    );
  }

  let startPhoto = sa?.event_start_photo || null;
  let endPhoto = sa?.event_end_photo || null;
  let startTimestamp = sa?.event_start_time || null;
  let endTimestamp = sa?.event_end_time || null;

  // Fallback to leadEquipmentHistory if sa doesn't have start/end photo
  if ((!startPhoto || !endPhoto || !startTimestamp || !endTimestamp) && leadEquipmentHistory && leadEquipmentHistory.length > 0) {
    const matchingHistory = leadEquipmentHistory.filter(h => {
      let parsed: any = {};
      if (h.remarks) {
        try { parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks; } catch (e) {}
      }
      const hAssignmentId = h.assignment_id || parsed.assignment_id;
      if (assignmentId && hAssignmentId) {
        return hAssignmentId === assignmentId;
      }
      if (orderId && h.order_id === orderId) {
        if (eventId && h.event_id && h.event_id !== eventId) return false;
        const retBy = (h.returned_by || parsed.staff_name || parsed.uploaded_by || '').trim().toLowerCase();
        const stNorm = (staffName || '').trim().toLowerCase();
        if (retBy && stNorm && (retBy === stNorm || retBy.includes(stNorm) || stNorm.includes(retBy))) return true;
      }
      return false;
    });

    matchingHistory.forEach(h => {
      let parsed: any = {};
      if (h.remarks) {
        try { parsed = typeof h.remarks === 'string' ? JSON.parse(h.remarks) : h.remarks; } catch (e) {}
      }
      const pType = (parsed.proof_type || h.proof_type || h.equipment_name || h.equipment_status || '').toLowerCase();
      const hUrl = h.photo_url || parsed.photo_url || null;
      const hTimeStr = h.created_at || h.returned_at || parsed.uploaded_at || null;

      if (!startPhoto && (pType.includes('event start') || pType.includes('eventstart'))) {
        startPhoto = hUrl;
        if (hTimeStr && !startTimestamp) startTimestamp = hTimeStr;
      }

      if (!endPhoto && (pType.includes('event end') || pType.includes('event complete') || pType.includes('eventcomplete'))) {
        endPhoto = hUrl;
        if (hTimeStr && !endTimestamp) endTimestamp = hTimeStr;
      }
    });
  }

  const startDate = startTimestamp ? formatISTDate(startTimestamp) : null;
  const startTime = startTimestamp ? formatISTTime12Hour(startTimestamp) : null;
  const endDate = endTimestamp ? formatISTDate(endTimestamp) : null;
  const endTime = endTimestamp ? formatISTTime12Hour(endTimestamp) : null;

  return {
    assignmentId: assignmentId || sa?.assignment_id || 'UNKNOWN',
    staffName: sa?.staff_name || staffName,
    staffRole: sa?.staff_role,
    eventId: sa?.event_id || eventId,
    eventName: sa?.event_name,
    eventStartPhoto: startPhoto,
    eventStartDate: startDate,
    eventStartTime: startTime,
    eventEndPhoto: endPhoto,
    eventEndDate: endDate,
    eventEndTime: endTime,
    taskStatus: sa?.task_status || 'Pending'
  };
}

/**
 * Resolves Raw Footage details strictly for this assignment slot.
 */
export function getRawFootageData(params: {
  assignmentId?: string;
  orderId?: string;
  eventId?: string;
  staffName: string;
  staffAssignment?: any;
  staffAssignments?: any[];
  rawFootageList?: any[];
  rawFootage?: any[];
}): RawFootageData {
  const { assignmentId, orderId, eventId, staffName, staffAssignment, staffAssignments = [], rawFootageList = [], rawFootage = [] } = params;
  const rfList = rawFootageList.length > 0 ? rawFootageList : rawFootage;

  let sa = staffAssignment || (assignmentId ? staffAssignments.find(s => s.assignment_id === assignmentId) : null);
  if (!sa && assignmentId && staffAssignments.length > 0) {
    sa = staffAssignments.find(s => s.assignment_id === assignmentId);
  }
  if (!sa && orderId) {
    sa = staffAssignments.find(s => 
      s.order_id === orderId && 
      (!eventId || s.event_id === eventId) &&
      (s.staff_name || '').trim().toLowerCase() === (staffName || '').trim().toLowerCase()
    );
  }

  let rawLink: string | null = null;
  if (assignmentId && rfList && rfList.length > 0) {
    const match = rfList.find(rf => rf.assignment_id === assignmentId);
    if (match) {
      rawLink = match.server_path || null;
    }
  }

  return {
    assignmentId: assignmentId || sa?.assignment_id || 'UNKNOWN',
    orderId: orderId || sa?.order_id || 'UNKNOWN',
    eventId: sa?.event_id || eventId,
    eventName: sa?.event_name,
    staffName: sa?.staff_name || staffName,
    staffRole: sa?.staff_role,
    rawFootageLink: rawLink,
    link: rawLink,
    updatedAt: sa?.updated_at,
    updatedBy: sa?.updated_by
  };
}

// ============================================================================
// 6. Comprehensive Staff Assignment Persistence Orchestration
// ============================================================================

export interface ExecuteSaveAssignmentsParams {
  orderId: string;
  leadId: string;
  assignments: {
    assignment_id?: string;
    task_id?: string;
    staff_role: string;
    staff_id: string;
    staff_name: string;
    mobile?: string;
    staff_type?: string;
    equipment?: string[];
    event_id?: string;
    event_name?: string;
    slot_number?: number;
    task_status?: string;
    assignment_status?: string;
    equipment_received_photo?: string | null;
    equipment_handover_photo?: string | null;
    equipment_handover_to?: string | null;
    equipment_handover_notes?: string | null;
    event_start_photo?: string | null;
    event_start_time?: string | null;
    event_end_photo?: string | null;
    event_end_time?: string | null;
    raw_footage_link?: string | null;
  }[];
  targetStage?: string;
  metaPayload?: {
    updatedEvents?: any[];
    allOrderEvents?: any[];
    equipmentKit?: string;
    reportingTime?: string;
    eventDate?: string;
    eventTime?: string;
    remarks?: string;
    equipmentUpdates?: { equipmentId: string; status: string }[];
    equipmentHistoryInserts?: any[];
  };
  existingStaffAssignments: any[];
  currentUserName?: string;
  currentRole?: string;
  staffList?: any[];
  pushUpdateFn?: (table: string, matchCol: string, matchVal: string, updates: any) => Promise<any>;
  pushInsertFn?: (table: string, payload: any) => Promise<any>;
}

export async function executeSaveStaffAssignments(params: ExecuteSaveAssignmentsParams): Promise<{
  success: boolean;
  savedAssignments: any[];
  opUpdates: any;
  orderUpdates: any;
  leadUpdates: any;
}> {
  const {
    orderId,
    leadId,
    assignments,
    targetStage,
    metaPayload,
    existingStaffAssignments = [],
    currentUserName,
    currentRole,
    staffList = [],
    pushUpdateFn,
    pushInsertFn
  } = params;

  if (!orderId) {
    throw new Error('Missing Required Field: orderId is required.');
  }

  const timestamp = new Date().toISOString();
  const assignDate = timestamp.split('T')[0];
  const changedBy = currentUserName || 'Operations Team';

  // 1. Fetch existing assignments directly from DB to prevent stale state
  let existingDbAssignments: any[] = [];
  if (supabaseClient) {
    try {
      const { data: dbData } = await supabaseClient
        .from('staff_assignments')
        .select('*')
        .eq('order_id', orderId);
      if (dbData && Array.isArray(dbData)) {
        existingDbAssignments = dbData;
      }
    } catch (fetchErr) {
      console.warn('[OperationsService] Could not fetch existing staff assignments from DB:', fetchErr);
    }
  }
  if (existingDbAssignments.length === 0 && existingStaffAssignments.length > 0) {
    existingDbAssignments = existingStaffAssignments.filter(sa => sa.order_id === orderId);
  }

  const updatedAssignments: { matchColumn: string; matchValue: string; updates: any }[] = [];
  const newInsertsForDb: any[] = [];
  const finalAssignmentsForState: any[] = [];
  const matchedDbAssignmentIds = new Set<string>();

  // Extract a deterministic array of all unique event IDs in this order to generate safe paddings
  const allKnownEvents = Array.from(new Set([
    ...assignments.map(a => a.event_id),
    ...existingDbAssignments.map(ed => ed.event_id),
    ...(metaPayload?.allOrderEvents?.map((e: any) => e.id) || []),
    ...(metaPayload?.updatedEvents?.map((e: any) => e.id) || [])
  ].filter(Boolean))).sort();

  // 2. Process each submitted assignment slot
  for (const a of assignments) {
    const aStaffNameTrimmed = (a.staff_name || '').trim();
    if (!aStaffNameTrimmed) continue;

    const eventId = a.event_id || 'ev';
    const roleName = a.staff_role ? a.staff_role.trim() : 'Staff';
    const slotNumber = a.slot_number || 1;

    const cleanRoleName = (roleName || 'Staff').replace(/[\uFEFF]+/g, '').trim();

    // Resolve or retain canonical assignment_id and task_id
    const deterministicAssignId = a.assignment_id || generateDeterministicAssignmentId(orderId, eventId, cleanRoleName, slotNumber);
    const deterministicTaskId = a.task_id || generateDeterministicTaskId(orderId, eventId, cleanRoleName, slotNumber);

    const st = staffList.find(s => s.name?.trim().toLowerCase() === aStaffNameTrimmed.toLowerCase());
    const resolvedStaffId = a.staff_id || (st as any)?.staff_id || (st as any)?.id || 'STF-0000';
    const staffType = a.staff_type || (st as any)?.staff_type || (st as any)?.Staff_Type || 'In-House';

    // Find if this assignment slot already exists in DB
    const matched = existingDbAssignments.find(ed => {
      if (matchedDbAssignmentIds.has(ed.assignment_id)) return false;
      // Strict Event Guard: If both have an event_id and they differ, NEVER match!
      if (ed.event_id && eventId && String(ed.event_id) !== String(eventId)) return false;

      // Exact assignment_id or task_id match
      if (a.assignment_id && ed.assignment_id === a.assignment_id) return true;
      if (deterministicAssignId && ed.assignment_id === deterministicAssignId) return true;
      if (a.task_id && ed.task_id === a.task_id) return true;
      if (deterministicTaskId && ed.task_id === deterministicTaskId) return true;

      // Role + Slot number match
      const edRole = (ed.staff_role || '').replace(/[\uFEFF]+/g, '').trim().toLowerCase();
      const thisRole = cleanRoleName.toLowerCase();
      const edSlot = Number(ed.slot_number || 1);
      if (edRole === thisRole && edSlot === slotNumber) return true;

      return false;
    });

    const canonicalAssignId = matched?.assignment_id || deterministicAssignId;

    // RULE: ONCE A TASK HAS STARTED, ITS ASSIGNMENT MUST BE LOCKED.
    // If this task has already started, reject any reassignment attempt to a different staff member.
    if (matched && isOperationsAssignmentStarted(matched)) {
      const existingStaff = (matched.staff_name || '').trim().toLowerCase();
      const newStaff = aStaffNameTrimmed.toLowerCase();
      if (existingStaff && newStaff && existingStaff !== newStaff) {
        throw new Error("This task has already started and cannot be reassigned.");
      }
    }

    // Parse equipment safely into array of strings
    let cleanEquipment: string[] = [];
    const eqVal = a.equipment as unknown;
    if (Array.isArray(eqVal)) {
      cleanEquipment = eqVal.map((e: any) => String(e).trim()).filter(Boolean);
    } else if (typeof eqVal === 'string' && eqVal.trim()) {
      cleanEquipment = eqVal.split(',').map((e: string) => e.trim()).filter(Boolean);
    } else if (Array.isArray((a as any).assigned_equipment)) {
      cleanEquipment = (a as any).assigned_equipment.map((e: any) => String(e).trim()).filter(Boolean);
    } else if (typeof (a as any).assigned_equipment === 'string' && (a as any).assigned_equipment.trim()) {
      cleanEquipment = (a as any).assigned_equipment.split(',').map((e: string) => e.trim()).filter(Boolean);
    }

    const safeAssignId = (canonicalAssignId || '').length > 50 ? canonicalAssignId.slice(0, 50) : canonicalAssignId;
    const safeTaskId = (deterministicTaskId || '').length > 50 ? deterministicTaskId.slice(0, 50) : deterministicTaskId;
    const safeOrderId = (orderId || '').length > 50 ? orderId.slice(0, 50) : orderId;
    const safeLeadId = leadId ? (leadId.length > 50 ? leadId.slice(0, 50) : leadId) : null;
    const safeEventId = eventId ? (eventId.length > 50 ? eventId.slice(0, 50) : eventId) : eventId;
    const safeStaffId = resolvedStaffId ? (resolvedStaffId.length > 50 ? resolvedStaffId.slice(0, 50) : resolvedStaffId) : resolvedStaffId;
    const safeStaffType = staffType ? (staffType.length > 50 ? staffType.slice(0, 50) : staffType) : 'In-House';
    const safeAssignStatus = (a.assignment_status || matched?.assignment_status || 'Assigned').slice(0, 50);
    const safeTaskStatus = (a.task_status || matched?.task_status || 'Assigned').slice(0, 50);
    const aReportingTime = (a as any).reporting_time || matched?.reporting_time || null;
    const safeReportingTime = aReportingTime ? String(aReportingTime).slice(0, 50) : null;
    const safeUpdatedBy = changedBy ? (changedBy.length > 50 ? changedBy.slice(0, 50) : changedBy) : changedBy;

    const slotPayload = {
      assignment_id: safeAssignId,
      task_id: safeTaskId,
      order_id: safeOrderId,
      lead_id: safeLeadId,
      event_id: safeEventId,
      event_name: a.event_name || null,
      staff_role: roleName.trim() + getEventRolePadding(Math.max(0, allKnownEvents.indexOf(safeEventId || '')), slotNumber),
      slot_number: slotNumber,
      staff_id: safeStaffId,
      staff_name: aStaffNameTrimmed,
      mobile: a.mobile || (st as any)?.mobile || (st as any)?.phone || '',
      staff_type: safeStaffType,
      equipment: cleanEquipment,
      assigned_equipment: cleanEquipment,
      assignment_date: (a as any).assignment_date || matched?.assignment_date || assignDate,
      assignment_status: safeAssignStatus,
      task_status: safeTaskStatus,
      reporting_time: safeReportingTime,
      // Strictly preserve existing photos and footage unless explicitly passed in this assignment
      equipment_received_photo: a.equipment_received_photo !== undefined ? a.equipment_received_photo : (matched?.equipment_received_photo || null),
      equipment_handover_photo: a.equipment_handover_photo !== undefined ? a.equipment_handover_photo : (matched?.equipment_handover_photo || null),
      equipment_handover_to: a.equipment_handover_to !== undefined ? a.equipment_handover_to : (matched?.equipment_handover_to || null),
      equipment_handover_notes: a.equipment_handover_notes !== undefined ? a.equipment_handover_notes : (matched?.equipment_handover_notes || null),
      event_start_photo: a.event_start_photo !== undefined ? a.event_start_photo : (matched?.event_start_photo || null),
      event_start_time: a.event_start_time !== undefined ? a.event_start_time : (matched?.event_start_time || null),
      event_end_photo: a.event_end_photo !== undefined ? a.event_end_photo : (matched?.event_end_photo || null),
      event_end_time: a.event_end_time !== undefined ? a.event_end_time : (matched?.event_end_time || null),
      raw_footage_link: a.raw_footage_link !== undefined ? a.raw_footage_link : (matched?.raw_footage_link || null),
      updated_at: timestamp,
      updated_by: safeUpdatedBy
    };

    finalAssignmentsForState.push(slotPayload);

    if (matched) {
      matchedDbAssignmentIds.add(matched.assignment_id);
      updatedAssignments.push({
        matchColumn: 'assignment_id',
        matchValue: matched.assignment_id,
        updates: slotPayload
      });
    } else {
      newInsertsForDb.push(slotPayload);
    }
  }

  // 3. Mark removed assignments as Cancelled if event was edited
  const touchedEventIds = new Set(assignments.map(a => a.event_id).filter(Boolean));
  for (const ed of existingDbAssignments) {
    if (!matchedDbAssignmentIds.has(ed.assignment_id) && !finalAssignmentsForState.some(r => r.assignment_id === ed.assignment_id)) {
      const belongsToTouchedEvent = ed.event_id && touchedEventIds.has(ed.event_id);
      if (belongsToTouchedEvent && ed.assignment_status !== 'Cancelled') {
        if (isOperationsAssignmentStarted(ed)) {
          throw new Error("This task has already started and cannot be reassigned.");
        }
        updatedAssignments.push({
          matchColumn: 'assignment_id',
          matchValue: ed.assignment_id,
          updates: {
            assignment_status: 'Cancelled',
            task_status: 'Cancelled',
            updated_at: timestamp,
            updated_by: changedBy
          }
        });
      } else if (!belongsToTouchedEvent) {
        finalAssignmentsForState.push({ ...ed });
      }
    }
  }

  // 4. Prepare operations update payload
  const opUpdates: any = {
    updated_by: changedBy
  };
  for (const a of assignments) {
    const roleLower = (a.staff_role || '').toLowerCase();
    if (roleLower.includes('photographer')) opUpdates.photographer_assigned = a.staff_name;
    else if (roleLower.includes('videographer')) opUpdates.videographer_assigned = a.staff_name;
    else if (roleLower.includes('drone') || roleLower.includes('aerial')) opUpdates.drone_operator_assigned = a.staff_name;
    else if (roleLower.includes('assistant')) opUpdates.assistant_assigned = a.staff_name;
  }
  if (metaPayload?.equipmentKit !== undefined) opUpdates.equipment_kit = metaPayload.equipmentKit;
  if (metaPayload?.reportingTime) opUpdates.reporting_time = metaPayload.reportingTime;
  if (metaPayload?.remarks !== undefined) opUpdates.remarks = metaPayload.remarks;
  if (metaPayload?.eventDate) opUpdates.event_date = metaPayload.eventDate;
  if (metaPayload?.eventTime) opUpdates.event_time = metaPayload.eventTime;
  if (targetStage) {
    opUpdates.event_status = targetStage;
    opUpdates.current_stage = targetStage;
  }
  opUpdates.assigned_staff = assignments.map(a => a.staff_name).join(', ');
  opUpdates.assigned_roles = assignments.map(a => a.staff_role).join(', ');

  // 5. Prepare order & lead updates
  const finalStage = targetStage || 'Assigned Crew';
  const preventDowngradeStages = [
    'Event Started', 'Event Completed', 'Raw Footage Received',
    'Editor Assigned', 'Editing Started', 'Editing In Progress',
    'Internal QC Review', 'Client Review Sent', 'Internal Review',
    'Client Review', 'Revision Required', 'Revision In Progress',
    'Revision', 'Final Approval', 'Ready for Delivery',
    'Delivered', 'Completed', 'Closed', 'Project Closed', 'Project Delivered'
  ];
  const shouldUpdateStage = targetStage && targetStage !== 'Order Confirmed' && !preventDowngradeStages.includes(targetStage);

  const orderUpdates: any = {
    updated_by: changedBy
  };
  if (metaPayload?.eventDate) orderUpdates.event_date = metaPayload.eventDate;
  if (metaPayload?.eventTime) orderUpdates.event_time = metaPayload.eventTime;
  if (shouldUpdateStage) {
    orderUpdates.current_stage = finalStage;
  }

  const leadUpdates: any = {
    updated_by: changedBy,
    assigned_staff: assignments.map(a => a.staff_name).join(', '),
    assigned_roles: assignments.map(a => a.staff_role).join(', ')
  };
  if (metaPayload?.updatedEvents) leadUpdates.events = metaPayload.updatedEvents;
  if (metaPayload?.equipmentKit !== undefined) leadUpdates.assigned_equipment = metaPayload.equipmentKit;
  if (metaPayload?.reportingTime) leadUpdates.reporting_time = metaPayload.reportingTime;
  if (shouldUpdateStage) {
    leadUpdates.current_status = finalStage;
    leadUpdates.status = finalStage;
  }

  // 6. Execute DB writes in parallel
  const dbPromises: Promise<any>[] = [];

  // Updates for existing assignments
  for (const item of updatedAssignments) {
    if (pushUpdateFn) {
      dbPromises.push(pushUpdateFn('staff_assignments', item.matchColumn, item.matchValue, item.updates));
    } else if (supabaseClient) {
      dbPromises.push(
        supabaseClient.from('staff_assignments').update(item.updates).eq(item.matchColumn, item.matchValue) as unknown as Promise<any>
      );
    }
  }

  // Inserts for new assignments
  for (const item of newInsertsForDb) {
    if (pushInsertFn) {
      dbPromises.push(pushInsertFn('staff_assignments', item));
    } else if (supabaseClient) {
      dbPromises.push(
        supabaseClient.from('staff_assignments').upsert([item], { onConflict: 'assignment_id' }) as unknown as Promise<any>
      );
    }
  }

  // Operations table update
  if (pushUpdateFn) {
    dbPromises.push(pushUpdateFn('operations', 'order_id', orderId, opUpdates));
  } else if (supabaseClient) {
    dbPromises.push(supabaseClient.from('operations').update(opUpdates).eq('order_id', orderId) as unknown as Promise<any>);
  }

  // Orders table update
  if (pushUpdateFn) {
    dbPromises.push(pushUpdateFn('orders', 'order_id', orderId, orderUpdates));
  } else if (supabaseClient) {
    dbPromises.push(supabaseClient.from('orders').update(orderUpdates).eq('order_id', orderId) as unknown as Promise<any>);
  }

  // Leads table update
  if (leadId) {
    if (pushUpdateFn) {
      dbPromises.push(pushUpdateFn('leads', 'lead_id', leadId, leadUpdates));
    } else if (supabaseClient) {
      dbPromises.push(supabaseClient.from('leads').update(leadUpdates).eq('lead_id', leadId) as unknown as Promise<any>);
    }
  }

  // Equipment statuses
  if (metaPayload?.equipmentUpdates) {
    for (const eqUp of metaPayload.equipmentUpdates) {
      if (pushUpdateFn) {
        dbPromises.push(pushUpdateFn('equipment', 'equipment_id', eqUp.equipmentId, { status: eqUp.status, updated_at: timestamp }));
      } else if (supabaseClient) {
        dbPromises.push(supabaseClient.from('equipment').update({ status: eqUp.status, updated_at: timestamp }).eq('equipment_id', eqUp.equipmentId) as unknown as Promise<any>);
      }
    }
  }

  // Equipment history inserts
  if (metaPayload?.equipmentHistoryInserts) {
    for (const hIns of metaPayload.equipmentHistoryInserts) {
      if (pushInsertFn) {
        dbPromises.push(pushInsertFn('lead_equipment_history', hIns));
      } else if (supabaseClient) {
        dbPromises.push(supabaseClient.from('lead_equipment_history').insert([hIns]) as unknown as Promise<any>);
      }
    }
  }

  await Promise.allSettled(dbPromises);

  return {
    success: true,
    savedAssignments: finalAssignmentsForState,
    opUpdates,
    orderUpdates,
    leadUpdates
  };
}

/**
 * Fetches assignments for an order from Supabase.
 */
export async function getAssignments(orderId: string): Promise<any[]> {
  if (!supabaseClient || !orderId) return [];
  const { data, error } = await supabaseClient
    .from('staff_assignments')
    .select('*')
    .eq('order_id', orderId)
    .neq('assignment_status', 'Cancelled');
  if (error) {
    console.warn('[OperationsService] getAssignments error:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetches details for a specific assignment_id.
 */
export async function getAssignmentDetails(assignmentId: string): Promise<any | null> {
  if (!supabaseClient || !assignmentId) return null;
  const { data, error } = await supabaseClient
    .from('staff_assignments')
    .select('*')
    .eq('assignment_id', assignmentId)
    .single();
  if (error) {
    console.warn('[OperationsService] getAssignmentDetails error:', error);
    return null;
  }
  return data;
}

