import { Lead, Order, StaffAssignment } from '../types';

export function getStageRank(stageName: string | undefined): number {
  if (!stageName) return 0;
  const s = stageName.trim().toLowerCase();

  // Rank 4+: Production, Verified Footage, Delivered, Completed, Closed
  if (
    s === 'verified footage' ||
    s === 'footage handover verified' ||
    s === 'raw footage received' ||
    s === 'production handover' ||
    s === 'assigned editor' ||
    s === 'editor assigned' ||
    s === 'editing started' ||
    s === 'editing in progress' ||
    s === 'internal qc review' ||
    s === 'customer review' ||
    s === 'client review sent' ||
    s === 'internal review' ||
    s === 'client review' ||
    s === 'revision required' ||
    s === 'revision in progress' ||
    s === 'revision' ||
    s === 'client acceptance' ||
    s === 'final approval' ||
    s === 'approved' ||
    s === 'ready for delivery' ||
    s === 'delivered' ||
    s === 'project delivered' ||
    s === 'completed' ||
    s === 'project closed' ||
    s === 'order closed' ||
    s === 'closed' ||
    s === 'business owner review'
  ) {
    return 4;
  }

  // Rank 3: Footage Handover
  if (
    s === 'footage handover' ||
    s === 'footage handover completed'
  ) {
    return 3;
  }

  // Rank 2: Event Ended / Event Completed / Event Complete / Event End
  if (
    s === 'event ended' ||
    s === 'event end' ||
    s === 'event completed' ||
    s === 'event complete'
  ) {
    return 2;
  }

  // Rank 1: Event Started / Event Start
  if (
    s === 'event started' ||
    s === 'event start'
  ) {
    return 1;
  }

  // Rank 0: Assigned Crew / Operations Assigned / Event Scheduled / Pending / etc.
  return 0;
}

export function getCalculatedOrderStage(
  currentStage: string | undefined,
  assignedStaffStatuses: (string | undefined)[]
): string {
  const baseStage = currentStage || 'Order Confirmed';
  const baseRank = getStageRank(baseStage);

  // If order is at Event Cancelled or already in Production / Completed (Rank >= 4), return baseStage
  if (baseRank >= 4 || ['event cancelled', 'cancelled'].includes(baseStage.toLowerCase().trim())) {
    return baseStage;
  }

  // If no staff assigned, return baseStage
  if (!assignedStaffStatuses || assignedStaffStatuses.length === 0) {
    return baseStage;
  }

  // Calculate lowest stage rank across ALL assigned staff members
  const staffRanks = assignedStaffStatuses.map(st => getStageRank(st));
  const minStaffRank = Math.min(...staffRanks);

  // Convert minStaffRank to stage string
  let calculatedStage: string;
  if (minStaffRank === 0) {
    // If staff are pending / not started, preserve baseStage (Order Confirmed stays Order Confirmed, Assigned Crew stays Assigned Crew)
    calculatedStage = baseStage;
  } else if (minStaffRank === 1) {
    calculatedStage = 'Event Started';
  } else if (minStaffRank === 2) {
    calculatedStage = 'Event Ended';
  } else if (minStaffRank === 3) {
    calculatedStage = 'Footage Handover';
  } else if (minStaffRank >= 4) {
    calculatedStage = 'Verified Footage';
  } else {
    calculatedStage = baseStage;
  }

  // Rule: Once a stage is completed by all staff, it must not revert to an earlier stage
  if (baseRank > 0 && getStageRank(calculatedStage) < baseRank) {
    return baseStage;
  }

  return calculatedStage;
}

export function getAllStaffStatusesForOrder(
  orderId: string,
  updatingStaffName?: string,
  updatingStaffStatus?: string,
  currentNextStatuses?: Record<string, string>,
  orders?: Order[],
  leads?: Lead[],
  staffAssignments?: StaffAssignment[]
): string[] {
  const staffStatusesList: string[] = [];

  const orderObj = orders?.find(o => o.order_id === orderId);
  const leadObj = leads?.find(l => l.lead_id === (orderObj?.lead_id || orderId));

  const matchingAssignments = staffAssignments?.filter(
    sa => sa.order_id === orderId && sa.assignment_status !== 'Cancelled'
  ) || [];

  if (matchingAssignments.length > 0) {
    matchingAssignments.forEach(sa => {
      const nameLower = (sa.staff_name || '').trim().toLowerCase();
      if (!nameLower) return;

      let st = 'Pending';
      if (updatingStaffName && nameLower === updatingStaffName.trim().toLowerCase() && updatingStaffStatus) {
        st = updatingStaffStatus;
      } else {
        if (currentNextStatuses) {
          const keysToTry = [
            `${orderId}_${sa.event_id || 'gen'}_${nameLower}`,
            `${orderId}_gen_${nameLower}`,
            `${orderId}_${nameLower}`
          ];
          for (const k of keysToTry) {
            if (currentNextStatuses[k]) {
              st = currentNextStatuses[k];
              break;
            }
          }
        }
        if (st === 'Pending') {
          if (sa.task_status && !['Assigned', 'Unassigned'].includes(sa.task_status)) {
            st = sa.task_status;
          } else if (sa.assignment_status && !['Assigned', 'Unassigned'].includes(sa.assignment_status)) {
            st = sa.assignment_status;
          }
        }
      }
      staffStatusesList.push(st);
    });
    return staffStatusesList;
  }

  // Fallback: Read from lead.events if no staffAssignments exist
  if (leadObj?.events && leadObj.events.length > 0) {
    leadObj.events.forEach((ev: any, evIdx: number) => {
      if (ev.assigned_staff_names && ev.assigned_staff_names.trim()) {
        const names = ev.assigned_staff_names.split(',').map((n: string) => n.trim()).filter(Boolean);
        names.forEach((name: string) => {
          const nameLower = name.toLowerCase();
          let st = 'Pending';

          if (updatingStaffName && nameLower === updatingStaffName.trim().toLowerCase() && updatingStaffStatus) {
            st = updatingStaffStatus;
          } else {
            if (currentNextStatuses) {
              const keysToTry = [
                `${orderId}_${ev.id || 'ev'}_${nameLower}`,
                `${orderId}_${evIdx}_${nameLower}`,
                `${orderId}_gen_${nameLower}`,
                `${orderId}_${nameLower}`
              ];
              for (const k of keysToTry) {
                if (currentNextStatuses[k]) {
                  st = currentNextStatuses[k];
                  break;
                }
              }
            }
          }
          staffStatusesList.push(st);
        });
      }
    });
  }

  return staffStatusesList;
}
