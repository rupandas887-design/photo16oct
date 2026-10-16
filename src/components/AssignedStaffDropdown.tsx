import React, { useState, useMemo } from 'react';
import { useRole } from './RoleContext';

export interface AssignedStaffMember {
  name: string;
  role: 'Sales' | 'Operations' | 'Production';
  subRole?: string;
  display: string;
}

export interface AssignedStaffDropdownProps {
  leadId?: string;
  orderId?: string;
  lead?: any;
  order?: any;
  productionItem?: any;
  className?: string;
}

export function getAssignedStaffList({
  leadId,
  orderId,
  lead,
  order,
  productionItem,
  leads = [],
  orders = [],
  operations = [],
  production = [],
  staffAssignments = []
}: {
  leadId?: string;
  orderId?: string;
  lead?: any;
  order?: any;
  productionItem?: any;
  leads?: any[];
  orders?: any[];
  operations?: any[];
  production?: any[];
  staffAssignments?: any[];
}): AssignedStaffMember[] {
  const result: AssignedStaffMember[] = [];
  const seenKeys = new Set<string>();

  const targetOrderId = orderId || order?.order_id || lead?.order_id || productionItem?.order_id || productionItem?.tracking_id;
  const targetLeadId = leadId || lead?.lead_id || order?.lead_id || productionItem?.lead_id || productionItem?.tracking_id;

  // Resolve matching lead, order, operations, and production objects if not directly provided
  const matchedLead = lead || (targetLeadId ? leads.find(l => l.lead_id === targetLeadId) : undefined) || (targetOrderId ? leads.find(l => l.order_id === targetOrderId || l.lead_id === targetOrderId) : undefined);
  const matchedOrder = order || (targetOrderId ? orders.find(o => o.order_id === targetOrderId) : undefined) || (targetLeadId ? orders.find(o => o.lead_id === targetLeadId || o.order_id === targetLeadId) : undefined);

  const effectiveLeadId = matchedLead?.lead_id || targetLeadId;
  const effectiveOrderId = matchedOrder?.order_id || targetOrderId;

  const addStaff = (name: any, role: 'Sales' | 'Operations' | 'Production', subRole?: string) => {
    if (!name || typeof name !== 'string') return;
    const cleanName = name.trim();
    if (
      !cleanName || 
      cleanName === '-' || 
      cleanName === '—' || 
      cleanName.toLowerCase() === 'n/a' || 
      cleanName.toLowerCase() === 'unassigned' || 
      cleanName.toLowerCase() === 'none' || 
      cleanName.toLowerCase() === 'null'
    ) {
      return;
    }
    const key = `${cleanName.toLowerCase()}__${role.toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push({
        name: cleanName,
        role,
        subRole,
        display: `${cleanName} — ${role}`
      });
    }
  };

  // 1. SALES PERSON / SALES STAFF
  const salesStaff = 
    matchedLead?.sales_person || 
    matchedLead?.sales_staff_name || 
    matchedOrder?.sales_person || 
    matchedOrder?.sales_staff_name;

  if (salesStaff) {
    salesStaff.split(',').forEach((s: string) => addStaff(s, 'Sales'));
  }

  // 2. OPERATIONS STAFF
  // A. From staffAssignments (matched by exact order_id / lead_id)
  if (staffAssignments && staffAssignments.length > 0) {
    staffAssignments.forEach(sa => {
      const isMatch = 
        (effectiveOrderId && (sa.order_id === effectiveOrderId || sa.lead_id === effectiveOrderId)) ||
        (effectiveLeadId && (sa.order_id === effectiveLeadId || sa.lead_id === effectiveLeadId));
      
      if (isMatch && sa.assignment_status !== 'Cancelled') {
        if (sa.staff_name) {
          addStaff(sa.staff_name, 'Operations', sa.staff_role);
        }
      }
    });
  }

  // B. From operations table
  const matchedOp = operations.find(op => 
    (effectiveOrderId && (op.order_id === effectiveOrderId || op.lead_id === effectiveOrderId)) ||
    (effectiveLeadId && (op.order_id === effectiveLeadId || op.lead_id === effectiveLeadId))
  );
  if (matchedOp) {
    if (matchedOp.assigned_staff) {
      matchedOp.assigned_staff.split(',').forEach((s: string) => addStaff(s, 'Operations'));
    }
    if (matchedOp.photographer_assigned) addStaff(matchedOp.photographer_assigned, 'Operations', 'Photographer');
    if (matchedOp.videographer_assigned) addStaff(matchedOp.videographer_assigned, 'Operations', 'Videographer');
    if (matchedOp.drone_operator_assigned) addStaff(matchedOp.drone_operator_assigned, 'Operations', 'Drone Operator');
    if (matchedOp.assistant_assigned) addStaff(matchedOp.assistant_assigned, 'Operations', 'Assistant');
  }

  // C. From lead events / order events (e.g. assigned_staff_names)
  const eventsList = (matchedLead?.events && Array.isArray(matchedLead.events)) 
    ? matchedLead.events 
    : (matchedOrder?.events && Array.isArray(matchedOrder.events)) 
      ? matchedOrder.events 
      : [];

  eventsList.forEach((ev: any) => {
    if (ev?.assigned_staff_names) {
      ev.assigned_staff_names.split(',').forEach((s: string) => addStaff(s, 'Operations'));
    }
  });

  // 3. PRODUCTION STAFF
  const matchedProd = productionItem || production.find(p => 
    (effectiveOrderId && (p.tracking_id === effectiveOrderId || p.order_id === effectiveOrderId || p.production_id === effectiveOrderId)) ||
    (effectiveLeadId && (p.tracking_id === effectiveLeadId || p.order_id === effectiveLeadId || p.production_id === effectiveLeadId))
  );

  if (matchedProd) {
    if (matchedProd.editor) addStaff(matchedProd.editor, 'Production');
    if (matchedProd.assigned_editor) addStaff(matchedProd.assigned_editor, 'Production');
    if (matchedProd.assigned_staff) {
      matchedProd.assigned_staff.split(',').forEach((s: string) => addStaff(s, 'Production'));
    }
    if (matchedProd.editor_name) addStaff(matchedProd.editor_name, 'Production');
  }

  const directEditor = matchedLead?.editor || matchedOrder?.editor;
  if (directEditor) {
    directEditor.split(',').forEach((s: string) => addStaff(s, 'Production'));
  }

  return result;
}

export const AssignedStaffDropdown: React.FC<AssignedStaffDropdownProps> = ({
  leadId,
  orderId,
  lead,
  order,
  productionItem,
  className = ''
}) => {
  const { leads, orders, operations, production, staffAssignments } = useRole();
  const [selectedStaff, setSelectedStaff] = useState<string>('');

  const assignedStaff = useMemo(() => {
    return getAssignedStaffList({
      leadId,
      orderId,
      lead,
      order,
      productionItem,
      leads,
      orders,
      operations,
      production,
      staffAssignments
    });
  }, [leadId, orderId, lead, order, productionItem, leads, orders, operations, production, staffAssignments]);

  if (assignedStaff.length === 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono text-zinc-500 bg-zinc-900/40 border border-zinc-850 select-none ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
        <span>Not Assigned</span>
      </span>
    );
  }

  const tooltipText = assignedStaff.map(s => s.display).join('\n');

  if (assignedStaff.length === 1) {
    return (
      <div className={`relative inline-block max-w-[200px] w-full ${className}`} title={tooltipText}>
        <select
          value={assignedStaff[0].display}
          onChange={(e) => {
            e.stopPropagation();
            setSelectedStaff(e.target.value);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-zinc-900 border border-zinc-750 hover:border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-amber-500 cursor-pointer truncate shadow-sm transition-colors"
        >
          <option value={assignedStaff[0].display} className="bg-zinc-950 text-zinc-200">
            {assignedStaff[0].display}
          </option>
        </select>
      </div>
    );
  }

  return (
    <div className={`relative inline-block max-w-[220px] w-full ${className}`} title={tooltipText}>
      <select
        value={selectedStaff || ''}
        onChange={(e) => {
          e.stopPropagation();
          setSelectedStaff(e.target.value);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-zinc-900 border border-zinc-750 hover:border-amber-500/50 text-amber-300 font-bold text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-amber-500 cursor-pointer truncate shadow-sm transition-colors"
      >
        <option value="" disabled className="bg-zinc-950 text-zinc-400 font-normal">
          {assignedStaff.length} Staff ({assignedStaff.map(s => s.name.split(' ')[0]).join(', ')})
        </option>
        {assignedStaff.map((st, i) => (
          <option 
            key={`${st.name}-${st.role}-${i}`} 
            value={st.display} 
            className="bg-zinc-950 text-zinc-200 font-normal py-1 font-sans"
          >
            {st.display}
          </option>
        ))}
      </select>
    </div>
  );
};
