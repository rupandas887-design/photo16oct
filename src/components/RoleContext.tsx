import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { User, Lead, LeadPackage, Order, Operation, RawFootage, Production, Payment, ActivityLog, UserRole, CurrentStage, EditingStatus, Staff, Notification, Equipment, Package, StaffAssignment, LeadStaffAssignmentHistory, LeadEquipmentHistory, ProductionSpeciality, EditorAssignment, PaymentStatus, EquipmentHandover, UnlockOverride, DEPARTMENT_STAGES, ROLE_DEPARTMENT_MAP, Department, LeadEvent, CalendarMemo, ClientAcceptanceVerification } from '../types';
import { INITIAL_USERS, INITIAL_LEADS, INITIAL_ORDERS, INITIAL_OPERATIONS, INITIAL_RAW_FOOTAGE, INITIAL_PRODUCTION, INITIAL_PAYMENTS, INITIAL_LOGS, INITIAL_EQUIPMENT } from '../data';
import { INITIAL_PACKAGES } from '../data/initialPackages';
export { INITIAL_PACKAGES };

import { supabaseClient, updateDiagnosticMetric } from '../supabaseClient';
import { serializeLeadEvents, deserializeLeadEvents, cleanPhone, cleanEmail, parseDeliverablesWithQty, parseTeamMembers, checkGlobalMobileUnique, checkGlobalStaffUniqueness, normalizeMobileNumber, saveCustomCategoryToStorage, getStoredCustomCategories, getAllMatchingOrderIds, isPasswordHashOrToken, isValidPlaintextPassword } from '../utils';
import { performBusinessOwnerReview } from '../utils/businessOwnerReview';
import { executeSaveStaffAssignments } from '../services/operationsAssignmentService';

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const getStatusRank = (status: string | undefined | null): number => {
  if (!status) return 0;
  const s = status.trim();
  if (['Lost Lead', 'Lead Lost'].includes(s)) return 99;
  if ([
    'Confirm Order', 'Order Confirmed', 'New Order Received', 'Operations Assigned', 
    'Assigned Crew', 'Staff Assigned', 'Event Scheduled', 'Event Started', 'Event Start', 
    'Event Ended', 'Event End', 'Event Completed', 'Event Complete', 'Footage Handover', 
    'Equipment Handover', 'Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 
    'Event Cancelled', 'Assigned Editor', 'Editor Assigned', 'Editing Started', 
    'Editing In Progress', 'Internal QC Review', 'Customer Review', 'Client Review Sent', 
    'Internal Review', 'Client Review', 'Revision Required', 'Revision In Progress', 
    'Revision', 'Client Acceptance', 'Final Approval', 'Approved', 'Ready for Delivery', 
    'Delivered', 'Completed', 'Closed', 'Project Closed', 'Project Delivered'
  ].includes(s)) {
    return 4;
  }
  if (['Quote Follow-up', 'Follow Up', 'Follow-up', 'Negotiation'].includes(s)) {
    return 3;
  }
  if (['Quote Sent', 'Quotation Sent'].includes(s)) {
    return 2;
  }
  if (['Create Quote', 'Created Quotation', 'New Lead', 'Contacted'].includes(s)) {
    return 1;
  }
  return 0;
};

export const isFollowUpDateTimeReached = (lead: Lead): boolean => {
  const rawStatus = lead.current_status || lead.status || '';
  if (['Confirm Order', 'Order Confirmed', 'Lost Lead', 'Lead Lost'].includes(rawStatus)) {
    return false;
  }

  const followUpDate = lead.next_follow_up_date || (lead as any).follow_up_date || '';
  if (!followUpDate) return false;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  if (followUpDate < todayStr) return true;
  if (followUpDate > todayStr) return false;

  let followUpTime = (lead as any).next_follow_up_time || '';
  if (!followUpTime && (lead.follow_up_notes || lead.remarks)) {
    const match = (lead.follow_up_notes || lead.remarks || '').match(/\[Time:\s*([0-9]{1,2}:[0-9]{2}(?:\s*[AP]M)?)\]/i);
    if (match) followUpTime = match[1];
  }

  if (!followUpTime) return true;

  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMins = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMins}`;

  let targetTime24 = followUpTime.trim();
  if (/AM|PM/i.test(targetTime24)) {
    const timeMatch = targetTime24.match(/([0-9]{1,2}):([0-9]{2})\s*([AP]M)/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2];
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      targetTime24 = `${String(h).padStart(2, '0')}:${m}`;
    }
  }

  return currentTimeStr >= targetTime24;
};

interface RoleContextType {
  currentUser: User | null;
  currentRole: UserRole;
  currentUserName: string;
  setCurrentRole: (role: UserRole) => void;
  setCurrentUserName: (name: string) => void;
  isDataLoading: boolean;
  editorAssignments: EditorAssignment[];
  login: (emailOrUsername: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  users: User[];
  leads: Lead[];
  allLeads?: Lead[];
  orders: Order[];
  allOrders?: Order[];
  operations: Operation[];
  rawFootage: RawFootage[];
  production: Production[];
  payments: Payment[];
  paymentHistory: any[];
  approvePayment: (historyId: string, orderId: string) => Promise<void>;
  rejectPayment: (historyId: string, orderId: string) => Promise<void>;
  logs: ActivityLog[];
  staff: Staff[];
  addStaff: (member: Omit<Staff, 'staff_id'>) => Promise<void>;
  updateStaff: (staffId: string, updates: Partial<Staff>) => Promise<void>;
  deleteStaff: (staffId: string) => Promise<void>;
  productionStaff: Staff[];
  addProductionStaff: (member: Omit<Staff, 'staff_id'>) => Promise<any>;
  updateProductionStaff: (staffId: string, updates: Partial<Staff>) => Promise<any>;
  deleteProductionStaff: (staffId: string) => Promise<any>;
  equipment: Equipment[];
  addEquipment: (equip: Omit<Equipment, 'equipment_id'>) => Promise<void>;
  updateEquipment: (equipmentId: string, updates: Partial<Equipment>) => Promise<void>;
  deleteEquipment: (equipmentId: string) => Promise<void>;
  notifications: Notification[];
  addNotification: (payload: Omit<Notification, 'notification_id' | 'created_at' | 'read_status'> & { notification_id?: string; read_status?: boolean }) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  deleteAllReadNotifications: () => Promise<void>;
  archiveNotification: (notificationId: string, archiveStatus?: boolean) => Promise<void>;
  
  leadPackages: LeadPackage[];
  packages: Package[];
  addPackage: (pkg: Omit<Package, 'package_id'>) => Promise<string>;
  updatePackage: (packageId: string, updates: Partial<Package>) => Promise<void>;
  deletePackage: (packageId: string) => Promise<void>;

  quotations: any[];
  addQuotation: (quotation: any) => Promise<string>;
  updateQuotation: (quotationId: string, updates: Partial<any>) => Promise<void>;
  updateLead: (leadId: string, updates: Partial<Lead>) => Promise<any>;
  saveLeadPackages: (leadId: string, packagesSelected: Omit<LeadPackage, 'lead_package_id' | 'lead_id'>[]) => Promise<void>;

  // Master flow operations
  addLead: (
    lead: Omit<Lead, 'lead_id' | 'status' | 'created_by' | 'sales_person' | 'created_date'>,
    packages?: Omit<LeadPackage, 'lead_package_id' | 'lead_id'>[]
  ) => string;
  updateLeadFollowUp: (
    leadId: string, 
    status: CurrentStage, 
    callNotes: string, 
    nextFollowUpDate: string, 
    quotationAmount?: number, 
    negotiationNotes?: string
  ) => Promise<void>;
  confirmOrder: (
    leadId: string, 
    packageName: string, 
    quotationAmount: number, 
    advanceReceived: number,
    eventDate?: string,
    eventTime?: string,
    paymentMode?: string,
    notes?: string,
    reportingTime?: string,
    transactionId?: string
  ) => string;
  assignOperations: (
    orderId: string, 
    opData: {
      photographer_assigned: string;
      videographer_assigned: string;
      drone_operator_assigned: string;
      assistant_assigned: string;
      equipment_kit: string;
      reporting_time: string;
      remarks?: string;
      current_stage?: CurrentStage;
      event_date?: string;
      event_time?: string;
      event_status?: string;
    }
  ) => Promise<void>;
  markEventCompleted: (orderId: string, serverPath: string) => Promise<void>;
  confirmRawFootageReceived: (
    orderId: string,
    footageLink?: string,
    storageType?: string,
    uploadNotes?: string,
    paymentCollectionStatus?: string,
    additionalReceived?: number,
    transactionId?: string
  ) => Promise<void>;
  updateOrderStage: (orderId: string, stage: CurrentStage) => Promise<void>;
  acceptRawFootage: (trackingId: string) => Promise<void>;
  updateProduction: (
    productionId: string, 
    updates: Partial<Omit<Production, 'production_id' | 'tracking_id'>>
  ) => Promise<void>;
  markDelivered: (trackingId: string, remarks?: string) => Promise<void>;
  recordPayment: (
    orderId: string, 
    amountReceived: number, 
    paymentDate: string, 
    proofUrl?: string,
    transactionId?: string,
    paymentMode?: string,
    paymentNotes?: string,
    paymentType?: string
  ) => Promise<void>;
  resetAllData: () => Promise<void>;
  refreshData: () => void;
  pushInsert: (table: string, record: any) => Promise<{ success: boolean; error?: string; localFallback?: boolean }>;
  pushUpsert: (table: string, record: any) => Promise<{ success: boolean; error?: string }>;
  pushUpdate: (table: string, matchColumn: string, matchValue: any, updates: any) => Promise<{ success: boolean; error?: string; localFallback?: boolean }>;
  pushDelete: (table: string, matchColumn: string, matchValue: any) => Promise<{ success: boolean; error?: string }>;
  statusHistory: any[];
  getLeadCurrentStatus: (lead: Lead) => string;
  getLeadCurrentStage: (lead: Lead) => 'Sales' | 'Operations' | 'Production' | 'Completed';
  
  // User Management Admin features
  addUser: (name: string, email: string, mobile: string, role: UserRole, active: boolean, password?: string, employee_id?: string) => Promise<void>;
  signUpUser: (name: string, username: string, email: string, mobile: string, role: UserRole, password: string) => Promise<any>;
  editUser: (id: string, updates: { name: string, email?: string, mobile?: string, role?: UserRole, active: boolean, employee_id?: string, password?: string }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  toggleUserStatus: (id: string) => Promise<void>;
  resetUserPassword: (id: string, newPassword: string) => Promise<void>;
  staffAssignments: StaffAssignment[];
  leadStaffAssignmentHistory: LeadStaffAssignmentHistory[];
  leadEquipmentHistory: LeadEquipmentHistory[];
  addLeadEquipmentHistory: (history: Omit<LeadEquipmentHistory, 'id'>) => Promise<void>;
  saveStaffAssignments: (
    orderId: string, 
    assignments: {
      assignment_id?: string;
      staff_role: string;
      staff_id: string;
      staff_name: string;
      mobile?: string;
      staff_type?: string;
      equipment?: string[];
      event_id?: string;
      event_name?: string;
      task_status?: string;
      assignment_status?: string;
    }[],
    targetStage?: CurrentStage,
    metaPayload?: {
      updatedEvents?: any[];
      equipmentKit?: string;
      reportingTime?: string;
      eventDate?: string;
      eventTime?: string;
      remarks?: string;
      equipmentUpdates?: { equipmentId: string; status: string }[];
      equipmentHistoryInserts?: any[];
    }
  ) => Promise<void>;

  specialities: ProductionSpeciality[];
  addSpeciality: (name: string) => Promise<void>;
  updateSpeciality: (id: string, name: string) => Promise<void>;
  deactivateSpeciality: (id: string, active: boolean) => Promise<void>;
  deleteSpeciality: (id: string) => Promise<void>;
  
  editorAssignments: EditorAssignment[];
  assignEditorToProject: (assignment: Omit<EditorAssignment, 'assignment_id' | 'status' | 'assigned_date'>) => Promise<void>;
  updateEditorAssignmentStatus: (assignmentId: string, status: EditorAssignment['status'], extraUpdates?: Partial<Omit<EditorAssignment, 'assignment_id'>>) => Promise<void>;
  updateEditorAssignment: (assignmentId: string, updates: Partial<Omit<EditorAssignment, 'assignment_id'>>) => Promise<void>;
  deleteEditorAssignment: (assignmentId: string) => Promise<void>;
  globalDateRange: { start: string; end: string };
  setGlobalDateRange: (range: { start: string; end: string }) => void;
  resetGlobalDateRange: () => void;
  equipmentHandovers: EquipmentHandover[];
  addEquipmentHandover: (handover: Omit<EquipmentHandover, 'handover_id'>) => Promise<void>;
  addEquipmentHandovers: (handovers: Omit<EquipmentHandover, 'handover_id'>[]) => Promise<void>;
  
  unlockedRecords: UnlockOverride[];
  getDepartmentForStage: (stage: CurrentStage) => Department | undefined;
  isDepartmentAllowedToEdit: (role: UserRole, stage: CurrentStage) => boolean;
  unlockRecord: (recordId: string, module: 'Sales' | 'Operations' | 'Production', reason: string) => void;
  lockRecord: (recordId: string, module: 'Sales' | 'Operations' | 'Production') => void;
  isRecordLocked: (recordId: string, module: 'Sales' | 'Operations' | 'Production') => boolean;
  deleteLead: (leadId: string) => Promise<boolean>;
  deleteOrder: (orderId: string) => Promise<boolean>;
  deleteFollowUp: (followUpId: string) => Promise<boolean>;
  deleteQuotation: (quotationId: string) => Promise<boolean>;
  deletePayment: (paymentId: string) => Promise<boolean>;
  deleteOperation: (operationId: string) => Promise<boolean>;
  deleteProduction: (productionId: string) => Promise<boolean>;
  deleteStaffAssignment: (assignmentId: string) => Promise<boolean>;
  deleteRawFootage: (trackingId: string) => Promise<boolean>;
  
  calendarMemos: CalendarMemo[];
  addCalendarMemo: (memo: Omit<CalendarMemo, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateCalendarMemo: (id: string, updates: Partial<CalendarMemo>) => Promise<void>;
  deleteCalendarMemo: (id: string) => Promise<void>;

  clientAcceptanceVerifications: ClientAcceptanceVerification[];
  saveClientAcceptanceVerification: (verification: ClientAcceptanceVerification) => Promise<ClientAcceptanceVerification>;
  isProductionDashboardActive?: boolean;
  setIsProductionDashboardActive?: (val: boolean) => void;
  getStaffCurrentPassword: (member: any) => string;
  fetchStaffCurrentPassword: (member: any) => Promise<string>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

// Stable UUID translator mapping helpers because Supabase 'public.users' id is UUID
export const mapToDbUserId = (id: string): string => {
  if (!id) return `00000000-0000-0000-0000-000000000000`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  if (id.startsWith('U-') && /^\d+$/.test(id.substring(2))) {
    const num = id.substring(2).padStart(12, '0');
    return `00000000-0000-0000-0000-${num}`;
  }
  // Deterministic hex hash conversion into 32 hex chars for UUID v4 style
  let hash1 = 0, hash2 = 0;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + ch;
    hash1 |= 0;
    hash2 = ((hash2 << 7) - hash2) + ch;
    hash2 |= 0;
  }
  const hex1 = Math.abs(hash1).toString(16).padStart(8, '0');
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const hex3 = Math.abs(hash1 ^ hash2).toString(16).padStart(4, '0');
  const hex4 = Math.abs(hash1 + hash2).toString(16).padStart(12, '0');
  return `${hex1}-${hex2.substring(0,4)}-4${hex3.substring(1,4)}-a${hex2.substring(4,7)}-${hex4.substring(0,12)}`;
};

export const mapFromDbUserId = (uuid: string): string => {
  if (uuid.startsWith('00000000-0000-0000-0000-')) {
    const suffix = uuid.replace('00000000-0000-0000-0000-', '');
    if (suffix === '999999999999') return 'U-temp';
    const num = parseInt(suffix, 10);
    return `U-${String(num).padStart(3, '0')}`;
  }
  return uuid;
};

// Stable UUID translator mapping helpers because Supabase 'public.operations_staff' staff_id is UUID
export const mapToDbStaffId = (id: string): string => {
  if (id && id.startsWith('STF-')) {
    const num = id.substring(4).padStart(12, '0');
    return `55555555-5555-5555-5555-${num}`;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return `55555555-5555-5555-5555-999999999999`;
};

export const mapFromDbStaffId = (uuid: string): string => {
  if (uuid && uuid.startsWith('55555555-5555-5555-5555-')) {
    const suffix = uuid.replace('55555555-5555-5555-5555-', '');
    if (suffix === '999999999999') return 'STF-temp';
    const num = parseInt(suffix, 10);
    return `STF-${String(num).padStart(3, '0')}`;
  }
  return uuid;
};

// Stable UUID translator mapping helpers because Supabase 'public.equipment' equipment_id is UUID
export const mapToDbEquipmentId = (id: string): string => {
  if (id && id.startsWith('EQ-')) {
    const num = id.substring(3).padStart(12, '0');
    return `66666666-6666-6666-6666-${num}`;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return `66666666-6666-6666-6666-999999999999`;
};

export const mapFromDbEquipmentId = (uuid: string): string => {
  if (uuid && uuid.startsWith('66666666-6666-6666-6666-')) {
    const suffix = uuid.replace('66666666-6666-6666-6666-', '');
    if (suffix === '999999999999') return 'EQ-temp';
    const num = parseInt(suffix, 10);
    return `EQ-${num}`;
  }
  return uuid;
};

export const mapUserFieldsFromDb = (u: any): any => {
  if (!u) return u;
  return {
    ...u,
    id: mapFromDbUserId(u.id),
    name: u.name || u.full_name || '',
    full_name: u.full_name || u.name || '',
    mobile: u.mobile || u.phone || '',
    phone: u.phone || u.mobile || ''
  };
};

export const getStaffCurrentPassword = (
  member: any,
  usersList: any[] = []
): string => {
  if (!member) return '';

  // 1. Check direct current_password property if valid plaintext
  if (member.current_password && isValidPlaintextPassword(member.current_password)) {
    return String(member.current_password).trim();
  }

  // 2. Check notes object / JSON for stored plaintext password
  if (member.notes) {
    try {
      const parsed = typeof member.notes === 'string' ? JSON.parse(member.notes) : member.notes;
      if (parsed && typeof parsed === 'object') {
        if (parsed.current_password && isValidPlaintextPassword(parsed.current_password)) {
          return String(parsed.current_password).trim();
        }
        if (parsed.password && isValidPlaintextPassword(parsed.password)) {
          return String(parsed.password).trim();
        }
        if (parsed.Password && isValidPlaintextPassword(parsed.Password)) {
          return String(parsed.Password).trim();
        }
        // Nested notes check (e.g. stringified JSON inside notes)
        if (parsed.notes && typeof parsed.notes === 'string') {
          try {
            const nested = JSON.parse(parsed.notes);
            if (nested && typeof nested === 'object') {
              if (nested.current_password && isValidPlaintextPassword(nested.current_password)) {
                return String(nested.current_password).trim();
              }
              if (nested.password && isValidPlaintextPassword(nested.password)) {
                return String(nested.password).trim();
              }
              if (nested.Password && isValidPlaintextPassword(nested.Password)) {
                return String(nested.Password).trim();
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  // 3. Check member.password / member.Password ONLY if it is a legitimate plaintext password (never a hash or token!)
  if (member.Password && isValidPlaintextPassword(member.Password)) {
    return String(member.Password).trim();
  }
  if (member.password && isValidPlaintextPassword(member.password)) {
    return String(member.password).trim();
  }

  let staffAuthId = member.auth_user_id;
  if (!staffAuthId && typeof member.notes === 'string' && member.notes.includes('auth_user_id')) {
    try {
      const parsed = JSON.parse(member.notes);
      if (parsed.auth_user_id) staffAuthId = parsed.auth_user_id;
      if (!staffAuthId && parsed.notes && typeof parsed.notes === 'string') {
        const nested = JSON.parse(parsed.notes);
        if (nested.auth_user_id) staffAuthId = nested.auth_user_id;
      }
    } catch (e) {}
  }

  const staffId = member.staff_id;
  const staffEmail = (member.email || '').trim().toLowerCase();
  let memberWhatsapp = member.whatsapp_number || '';
  if (!memberWhatsapp && typeof member.notes === 'string') {
    try {
      const parsed = JSON.parse(member.notes);
      if (parsed.whatsapp_number) memberWhatsapp = parsed.whatsapp_number;
    } catch (e) {}
  }
  const rawMobile = member.mobile || memberWhatsapp || '';
  const mobileDigits = rawMobile.replace(/\D/g, '');
  const mobileLast10 = mobileDigits.length >= 10 ? mobileDigits.slice(-10) : mobileDigits;
  const staffName = (member.name || '').trim().toLowerCase();

  const checkUser = (u: any): string | null => {
    if (!u) return null;
    const pwd = u.password;
    if (pwd !== undefined && pwd !== null && isValidPlaintextPassword(String(pwd))) {
      return String(pwd).trim();
    }
    return null;
  };

  // 4. Check auth_user_id match in usersList
  if (staffAuthId) {
    const u = usersList.find(x => x && (x.id === staffAuthId || mapToDbUserId(x.id) === staffAuthId || (x as any).auth_user_id === staffAuthId));
    const pwd = checkUser(u);
    if (pwd) return pwd;
  }

  // 5. Check email or username match
  if (staffEmail) {
    const u = usersList.find(x => {
      if (!x) return false;
      const uEmail = (x.email || '').trim().toLowerCase();
      const uUsername = (x.username || '').trim().toLowerCase();
      return uEmail === staffEmail || uUsername === staffEmail;
    });
    const pwd = checkUser(u);
    if (pwd) return pwd;
  }

  // 6. Check mobile match (exact digits or 10-digit suffix)
  if (mobileLast10 && mobileLast10.length >= 7) {
    const u = usersList.find(x => {
      if (!x) return false;
      const uMobileDigits = (x.mobile || x.phone || x.name || '').replace(/\D/g, '');
      const uMobileLast10 = uMobileDigits.length >= 10 ? uMobileDigits.slice(-10) : uMobileDigits;
      const uEmail = (x.email || '').toLowerCase();
      return (
        (uMobileDigits && (uMobileDigits === mobileDigits || (uMobileLast10 && uMobileLast10 === mobileLast10))) ||
        (mobileDigits.length >= 8 && uEmail.includes(mobileDigits.slice(0, 8)))
      );
    });
    const pwd = checkUser(u);
    if (pwd) return pwd;
  }

  // 7. Check staff_id match
  if (staffId) {
    const u = usersList.find(x => x && (x.id === staffId || mapToDbUserId(x.id) === mapToDbUserId(staffId) || x.id === mapToDbStaffId(staffId)));
    const pwd = checkUser(u);
    if (pwd) return pwd;
  }

  // 8. Check exact trimmed name match
  if (staffName) {
    const u = usersList.find(x => x && (x.name || x.full_name || '').trim().toLowerCase() === staffName);
    const pwd = checkUser(u);
    if (pwd) return pwd;
  }

  return '';
};

export const fetchStaffCurrentPassword = async (
  member: any,
  usersList: any[] = []
): Promise<string> => {
  const syncPwd = getStaffCurrentPassword(member, usersList);
  if (syncPwd && isValidPlaintextPassword(syncPwd)) return syncPwd;
  if (!member) return '';

  let staffAuthId = member.auth_user_id;
  if (!staffAuthId && typeof member.notes === 'string' && member.notes.includes('auth_user_id')) {
    try {
      const parsed = JSON.parse(member.notes);
      if (parsed.auth_user_id) staffAuthId = parsed.auth_user_id;
      if (!staffAuthId && parsed.notes && typeof parsed.notes === 'string') {
        const nested = JSON.parse(parsed.notes);
        if (nested.auth_user_id) staffAuthId = nested.auth_user_id;
      }
    } catch (e) {}
  }

  const staffEmail = (member.email || '').trim().toLowerCase();
  const rawMobile = (member.mobile || '').trim();
  const staffName = (member.name || '').trim();

  try {
    const orClauses: string[] = [];
    if (staffAuthId) orClauses.push(`id.eq.${staffAuthId}`);
    if (staffEmail) {
      orClauses.push(`email.ilike.${staffEmail}`);
      orClauses.push(`username.ilike.${staffEmail}`);
    }
    if (rawMobile) orClauses.push(`mobile.eq.${rawMobile}`);
    if (staffName) orClauses.push(`name.ilike.${staffName}`);

    if (orClauses.length > 0 && supabaseClient) {
      const { data } = await supabaseClient
        .from('users')
        .select('password')
        .or(orClauses.join(','))
        .not('password', 'is', null)
        .limit(1);

      if (data && data.length > 0 && data[0]?.password) {
        const candidate = String(data[0].password).trim();
        if (isValidPlaintextPassword(candidate)) {
          return candidate;
        }
      }
    }
  } catch (err) {
    console.warn("Live password retrieval warning:", err);
  }

  return '';
};

const mapNotificationFromDb = (notif: any): Notification => {
  let user_id = notif.user_id;
  let project_id = notif.project_id;
  let task_id = notif.task_id;
  let notification_type = notif.notification_type || 'System Notification';
  let read_status = notif.read_status !== undefined ? notif.read_status : notif.is_read;

  if (notif.action_url && notif.action_url.startsWith('extra:')) {
    try {
      const extraData = JSON.parse(notif.action_url.substring(6));
      user_id = extraData.user_id || user_id;
      project_id = extraData.project_id || project_id;
      task_id = extraData.task_id || task_id;
      notification_type = extraData.notification_type || notification_type;
      if (extraData.read_status !== undefined) {
        read_status = extraData.read_status;
      }
    } catch (e) {
      console.error("Failed to parse extra notification info:", e);
    }
  }

  return {
    notification_id: notif.notification_id,
    user_id,
    project_id,
    task_id,
    notification_type,
    title: notif.title,
    message: notif.message,
    read_status: !!read_status,
    is_read: !!read_status,
    read: !!read_status,
    created_at: notif.created_at,
    recipient_role: notif.recipient_role,
    priority: notif.priority,
    recipient_user_id: notif.recipient_user_id,
    recipient_email: notif.recipient_email,
    sender_user_id: notif.sender_user_id,
    sender_name: notif.sender_name,
    related_table: notif.related_table,
    related_record_id: notif.related_record_id,
    action_url: notif.action_url,
    is_archived: !!notif.is_archived,
    read_at: notif.read_at,
    expires_at: notif.expires_at,
  };
};

const saveNotificationToSupabase = async (notif: Notification) => {
  if (!supabaseClient) return;
  
  const payload = {
    notification_id: notif.notification_id,
    recipient_role: notif.recipient_role || 'All',
    title: notif.title,
    message: notif.message,
    is_read: notif.read_status,
    user_id: notif.user_id,
    project_id: notif.project_id,
    task_id: notif.task_id,
    notification_type: notif.notification_type,
    read_status: notif.read_status,
    priority: notif.priority || 'Medium',
    recipient_user_id: notif.recipient_user_id,
    recipient_email: notif.recipient_email,
    sender_user_id: notif.sender_user_id,
    sender_name: notif.sender_name,
    related_table: notif.related_table,
    related_record_id: notif.related_record_id,
    action_url: notif.action_url,
    is_archived: notif.is_archived ?? false,
    read_at: notif.read_at,
    expires_at: notif.expires_at,
    created_at: notif.created_at || new Date().toISOString()
  };

  const { error } = await supabaseClient.from('notifications').insert(payload);
  
  if (error) {
    console.warn("Failed inserting notification with all fields, trying fallback:", error);
    const encodedExtra = JSON.stringify({
      user_id: notif.user_id,
      project_id: notif.project_id,
      task_id: notif.task_id,
      notification_type: notif.notification_type,
      read_status: notif.read_status,
      priority: notif.priority,
      recipient_user_id: notif.recipient_user_id,
      recipient_email: notif.recipient_email,
      sender_user_id: notif.sender_user_id,
      sender_name: notif.sender_name,
      related_table: notif.related_table,
      related_record_id: notif.related_record_id,
      is_archived: notif.is_archived,
      read_at: notif.read_at,
      expires_at: notif.expires_at
    });
    
    const fallbackPayload = {
      notification_id: notif.notification_id,
      recipient_role: notif.recipient_role || 'All',
      title: notif.title,
      message: notif.message,
      is_read: notif.read_status,
      action_url: `extra:${encodedExtra}`
    };
    
    const { error: fallbackError } = await supabaseClient.from('notifications').insert(fallbackPayload);
    if (fallbackError) {
      // Suppress error since notifications table may not exist
      // console.error("Fallback insert failed too:", fallbackError);
    }
  }
};

// INITIAL_PACKAGES imported from ../data/initialPackages

export const mapPackageToDbPayload = (pkg: Partial<Package> & { package_id: string; package_name: string; price: number }) => {
  const extraData = {
    category: pkg.category || 'Weddings',
    deliverables: pkg.deliverables || '',
    team_members: pkg.team_members || '',
    seasonal_offer: pkg.seasonal_offer || '',
    terms_conditions: pkg.terms_conditions || '',
    event_type: pkg.event_type || '',
    duration: pkg.duration || '',
    package_includes: pkg.package_includes || ''
  };

  return {
    package_id: pkg.package_id,
    name: pkg.package_name,
    description: JSON.stringify(extraData),
    price: pkg.price,
    status: pkg.status || 'Active',
    created_at: pkg.created_at || new Date().toISOString()
  };
};

export const mapDbRecordToPackage = (record: any): Package => {
  let category = 'Weddings'; // Default fallback
  let deliverables = record.description || '';
  let team_members = '';
  let seasonal_offer = '';
  let terms_conditions = '';
  let event_type = '';
  let duration = '';
  let package_includes = '';

  if (record.description && typeof record.description === 'string' && record.description.trim().startsWith('{') && record.description.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(record.description);
      category = parsed.category || category;
      deliverables = parsed.deliverables || '';
      team_members = parsed.team_members || '';
      seasonal_offer = parsed.seasonal_offer || '';
      terms_conditions = parsed.terms_conditions || '';
      event_type = parsed.event_type || parsed.category || category;
      duration = parsed.duration || '';
      package_includes = parsed.package_includes || '';
    } catch (e) {
      console.warn('Failed to parse JSON description for package:', record.package_id);
    }
  }

  const finalCategory = record.category || category;
  const finalEventType = event_type || finalCategory;

  return {
    package_id: record.package_id,
    package_name: record.name || record.package_name || '',
    category: finalCategory,
    price: record.price !== undefined && record.price !== null ? Number(record.price) : 0,
    status: record.status || 'Active',
    deliverables,
    team_members,
    seasonal_offer,
    terms_conditions,
    event_type: finalEventType,
    duration,
    package_includes,
    created_at: record.created_at
  };
};

export const validatePackagesDatabase = async (operation: 'SELECT' | 'INSERT' | 'UPDATE', payload?: any) => {
  if (!supabaseClient) {
    throw new Error('Supabase client is not initialized.');
  }

  // 1. Verify if the table exists
  const { error: tableError } = await supabaseClient.from('packages').select('package_id').limit(0);
  if (tableError) {
    if (tableError.code === '42P01' || tableError.message?.toLowerCase().includes('relation "packages" does not exist')) {
      const errorMsg = `❌ Database Error\n\nTable: packages\n\nReason: The table does not exist.\n\nSuggested Fix: Create the **packages** table in Supabase.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // 2. Verify if every required column exists
  const requiredCols = ['package_id', 'name', 'description', 'price', 'status', 'created_at'];
  for (const col of requiredCols) {
    const { error: colError } = await supabaseClient.from('packages').select(col).limit(0);
    if (colError) {
      if (colError.code === '42703' || colError.message?.toLowerCase().includes('column') || colError.message?.toLowerCase().includes('does not exist')) {
        const errorMsg = `❌ Database Error\n\nTable: packages\n\nMissing Column: ${col}\n\nReason: The column does not exist in the Supabase database.\n\nSuggested Fix: Create the column: ${col} in the table: packages`;
        window.alert(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }

  // 3. For INSERT/UPDATE operations, check the payload
  if (operation === 'INSERT' || operation === 'UPDATE') {
    if (!payload) {
      const errorMsg = `❌ Mapping Error\n\nReason: Payload is missing.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (operation === 'INSERT') {
      if (!payload.package_id) {
        const errorMsg = `❌ Mapping Error\n\nField: Package ID\n\nReason: The frontend is not sending this value to Supabase.\n\nSuggested Fix: Include the **package_id** field in the INSERT and UPDATE payload.`;
        window.alert(errorMsg);
        throw new Error(errorMsg);
      }
    }

    if (!payload.name) {
      const errorMsg = `❌ Mapping Error\n\nField: Package Name\n\nReason: The frontend form is not sending this value to Supabase.\n\nSuggested Fix: Include the **name** field in the INSERT and UPDATE payload.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (payload.price === undefined || payload.price === null) {
      const errorMsg = `❌ Mapping Error\n\nField: Price\n\nReason: The frontend form is not sending this value to Supabase.\n\nSuggested Fix: Include the **price** field in the INSERT and UPDATE payload.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (!payload.status) {
      const errorMsg = `❌ Mapping Error\n\nField: Status\n\nReason: The frontend form is not sending this value to Supabase.\n\nSuggested Fix: Include the **status** field in the INSERT and UPDATE payload.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (payload.description === undefined || payload.description === null) {
      const errorMsg = `❌ Mapping Error\n\nField: Description\n\nReason: The frontend form is not sending this value to Supabase.\n\nSuggested Fix: Include the **description** field in the INSERT and UPDATE payload.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }
  }
};

let cachedProdStaffColumns: string[] | null = null;

export const getProductionStaffColumns = async (): Promise<string[]> => {
  if (cachedProdStaffColumns) return cachedProdStaffColumns;
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      }
    });
    if (res.ok) {
      const spec = await res.json();
      const props = spec.definitions?.production_staff?.properties;
      if (props) {
        cachedProdStaffColumns = Object.keys(props);
        console.log('[RoleContext] Detected live production_staff columns:', cachedProdStaffColumns);
        return cachedProdStaffColumns;
      }
    }
  } catch (err) {
    console.error('[RoleContext] Error detecting production_staff columns:', err);
  }
  return ['staff_id', 'name', 'mobile', 'email', 'role', 'department', 'status', 'joining_date', 'notes', 'created_at', "'production_role_speciality", 'Staff_Type', 'staff_type', 'whatsapp_number', 'production_role_speciality', 'Skill', 'skill', 'city', 'experience', 'employee_id', 'Password', 'password'];
};

export const mapProductionStaffFromDb = (item: any): Staff => {
  let extra: any = {};
  if (item.notes && item.notes.trim().startsWith('{') && item.notes.trim().endsWith('}')) {
    try { extra = JSON.parse(item.notes); } catch (e) {}
  }
  
  let nestedExtra: any = {};
  if (extra.notes && typeof extra.notes === 'string' && extra.notes.trim().startsWith('{') && extra.notes.trim().endsWith('}')) {
    try { nestedExtra = JSON.parse(extra.notes); } catch (e) {}
  }
  
  const name = item.staff_name || item.name || '';
  const mobile = item.mobile_number || item.mobile || '';
  const whatsapp_number = item.whatsapp_number || nestedExtra.whatsapp_number || extra.whatsapp_number || item.mobile_number || item.mobile || '';
  
  let production_role_speciality = item.production_role_speciality || item["'production_role_speciality"] || extra.production_role_speciality || '';
  if (typeof production_role_speciality === 'string' && production_role_speciality.startsWith('[') && production_role_speciality.endsWith(']')) {
    try {
      const parsed = JSON.parse(production_role_speciality);
      if (Array.isArray(parsed)) {
        production_role_speciality = parsed.join(', ');
      }
    } catch (e) {}
  }
  
  // Prioritize explicit Freelancer over default In-House if both exist in different formats, or fallback to any specified type
  const candidates = [
    item.staff_type,
    extra.staff_type,
    nestedExtra.staff_type,
    item.Staff_Type,
    extra.Staff_Type,
    nestedExtra.Staff_Type
  ].filter(val => val === 'In-House' || val === 'Freelancer');
  const resolvedStaffType = candidates.includes('Freelancer') ? 'Freelancer' : 'In-House';

  // Extract legitimate plaintext password if present in notes or fields, never assign a hash
  const resolvedRawPassword = [
    extra.current_password,
    nestedExtra.current_password,
    extra.password,
    extra.Password,
    item.password,
    item.Password
  ].find(p => p && isValidPlaintextPassword(p)) || '';

  return {
    ...item,
    ...extra,
    staff_id: item.staff_id,
    name,
    mobile,
    whatsapp_number,
    production_role_speciality,
    staff_type: resolvedStaffType,
    email: item.email || `${name.toLowerCase().replace(/\s+/g, '')}@photocrew.com`,
    role: item.role || 'Editor',
    department: item.department || 'Post-Production',
    status: item.status || 'Active',
    joining_date: item.joining_date || new Date().toISOString().split('T')[0],
    Skill: Array.isArray(item.Skill) ? item.Skill : (typeof item.Skill === 'string' ? item.Skill.split(',').map((s: any) => s.trim()).filter(Boolean) : (Array.isArray(extra.Skill) ? extra.Skill : [])),
    auth_user_id: extra.auth_user_id || nestedExtra.auth_user_id || item.auth_user_id || undefined,
    current_password: resolvedRawPassword,
    password: resolvedRawPassword,
    Password: resolvedRawPassword,
    notes: item.notes
  };
};

export const mapProductionStaffToDb = async (member: Staff | Partial<Staff>) => {
  const cols = await getProductionStaffColumns();
  const dbRecord: any = {};
  const extra: any = {};

  if (member.staff_id) dbRecord.staff_id = member.staff_id;

  if (member.name !== undefined) {
    if (cols.includes('staff_name')) {
      dbRecord.staff_name = member.name;
    }
    if (cols.includes('name')) {
      dbRecord.name = member.name;
    }
  }

  if (member.mobile !== undefined) {
    if (cols.includes('mobile_number')) {
      dbRecord.mobile_number = member.mobile;
    }
    if (cols.includes('mobile')) {
      dbRecord.mobile = member.mobile;
    }
  }

  if (member.whatsapp_number !== undefined) {
    if (cols.includes('whatsapp_number')) {
      dbRecord.whatsapp_number = member.whatsapp_number;
    } else {
      extra.whatsapp_number = member.whatsapp_number;
    }
  }

  if (member.staff_type !== undefined) {
    if (cols.includes('Staff_Type')) {
      dbRecord.Staff_Type = member.staff_type;
    }
    if (cols.includes('staff_type')) {
      dbRecord.staff_type = member.staff_type;
    }
    if (!cols.includes('Staff_Type') && !cols.includes('staff_type')) {
      extra.Staff_Type = member.staff_type;
    }
  }

  if ((member as any).Staff_Type !== undefined) {
    if (cols.includes('Staff_Type')) {
      dbRecord.Staff_Type = (member as any).Staff_Type;
    }
    if (cols.includes('staff_type')) {
      dbRecord.staff_type = (member as any).Staff_Type;
    }
    if (!cols.includes('Staff_Type') && !cols.includes('staff_type')) {
      extra.Staff_Type = (member as any).Staff_Type;
    }
  }

  if (member.production_role_speciality !== undefined) {
    const skillsVal = member.production_role_speciality;
    if (cols.includes('production_role_speciality')) {
      dbRecord.production_role_speciality = skillsVal;
    } else if (cols.includes("'production_role_speciality")) {
      dbRecord["'production_role_speciality"] = skillsVal;
    } else {
      extra.production_role_speciality = skillsVal;
    }
  }

  if (member.Skill !== undefined) {
    if (cols.includes('Skill')) {
      dbRecord.Skill = member.Skill;
    } else {
      extra.Skill = member.Skill;
    }
  }

  const pwdVal = (member as any).Password || (member as any).password || extra.Password || extra.password;
  if (pwdVal !== undefined) {
    if (cols.includes('Password')) {
      dbRecord.Password = pwdVal;
    }
    if (cols.includes('password')) {
      dbRecord.password = pwdVal;
    }
    if (!cols.includes('Password') && !cols.includes('password')) {
      dbRecord.Password = pwdVal;
    }
  }

  const standardFields = ['email', 'role', 'department', 'status', 'joining_date', 'profile_photo', 'auth_user_id'];
  for (const field of standardFields) {
    if ((member as any)[field] !== undefined) {
      if (cols.includes(field)) {
        dbRecord[field] = (member as any)[field];
      } else {
        extra[field] = (member as any)[field];
      }
    }
  }

  if (!member.staff_id) {
    if (cols.includes('email') && !dbRecord.email) {
      dbRecord.email = `${(member.name || '').toLowerCase().replace(/\s+/g, '') || 'staff'}@photocrew.com`;
    }
    if (cols.includes('role') && !dbRecord.role) {
      dbRecord.role = member.role || 'Editor';
    }
    if (cols.includes('department') && !dbRecord.department) {
      dbRecord.department = member.department || 'Post-Production';
    }
    if (cols.includes('status') && !dbRecord.status) {
      dbRecord.status = member.status || 'Active';
    }
    if (cols.includes('joining_date') && !dbRecord.joining_date) {
      dbRecord.joining_date = member.joining_date || new Date().toISOString().split('T')[0];
    }
  }

  if (member.notes !== undefined) {
    extra.notes = member.notes;
  }
  if (Object.keys(extra).length > 0) {
    dbRecord.notes = JSON.stringify(extra);
  }

  return dbRecord;
};

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [globalModalAlert, setGlobalModalAlert] = useState<{ message: string; title: string } | null>(null);

  useEffect(() => {
    // Beautiful, non-blocking window.alert override for sandboxed frames
    window.alert = (message: string) => {
      let title = "Notification";
      const lower = message.toLowerCase();
      if (message.startsWith("🎉") || lower.includes("success") || lower.includes("successfully") || lower.includes("completed") || lower.includes("congrat")) {
        title = "Operation Successful";
      } else if (lower.includes("fail") || lower.includes("error") || lower.includes("invalid") || lower.includes("required") || lower.includes("mandatory") || lower.includes("not allow")) {
        title = "Action Required";
      } else if (lower.includes("warn") || lower.includes("caution") || lower.includes("attention")) {
        title = "System Warning";
      }
      setGlobalModalAlert({ title, message });
    };
  }, []);

  const [globalDateRange, setGlobalDateRangeState] = useState<{ start: string; end: string }>(() => {
    const savedStart = sessionStorage.getItem('erp_global_start_date');
    const savedEnd = sessionStorage.getItem('erp_global_end_date');
    return {
      start: savedStart || '2026-06-01',
      end: savedEnd || '2026-06-30'
    };
  });

  const setGlobalDateRange = (range: { start: string; end: string }) => {
    sessionStorage.setItem('erp_global_start_date', range.start);
    sessionStorage.setItem('erp_global_end_date', range.end);
    setGlobalDateRangeState(range);
  };

  const resetGlobalDateRange = () => {
    sessionStorage.removeItem('erp_global_start_date');
    sessionStorage.removeItem('erp_global_end_date');
    setGlobalDateRangeState({ start: '2026-06-01', end: '2026-06-30' });
  };

  // Initialize state arrays as empty so data is always loaded directly from Supabase (the single source of truth) without relying on cached or stale demo data
  const [users, setUsers] = useState<User[]>([]);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('erp_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const currentUserRef = useRef<User | null>(null);
  const isLoggingInRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);
  const fetchPendingRef = useRef<boolean>(false);
  const lastFetchTimeRef = useRef<number>(0);
  const activeFetchPromiseRef = useRef<Promise<void> | null>(null);
  const isCheckingRemindersRef = useRef<boolean>(false);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [currentRole, setCurrentRoleState] = useState<UserRole>(() => {
    return (localStorage.getItem('erp_role') as UserRole) || 'Business Owner';
  });

  const [currentUserName, setCurrentUserNameState] = useState<string>(() => {
    return localStorage.getItem('erp_user_name') || 'Rupand Das';
  });

  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [leadPackages, setLeadPackages] = useState<LeadPackage[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [rawFootage, setRawFootage] = useState<RawFootage[]>([]);
  const [production, setProduction] = useState<Production[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [calendarMemos, setCalendarMemos] = useState<CalendarMemo[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [productionStaff, setProductionStaff] = useState<Staff[]>([]);

  const [equipment, setEquipment] = useState<Equipment[]>(() => {
    try {
      const saved = localStorage.getItem('erp_equipment');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return INITIAL_EQUIPMENT;
  });

  const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);

  const [leadStaffAssignmentHistory, setLeadStaffAssignmentHistory] = useState<LeadStaffAssignmentHistory[]>([]);
  const [leadEquipmentHistory, setLeadEquipmentHistory] = useState<LeadEquipmentHistory[]>([]);
  const [taskAssignmentDetails, setTaskAssignmentDetails] = useState<TaskAssignmentDetail[]>([]);

  const [specialities, setSpecialities] = useState<ProductionSpeciality[]>([
    { speciality_id: 'SPC-001', name: 'Wedding Video Editor', active: true },
    { speciality_id: 'SPC-002', name: 'Reel Editor', active: true },
    { speciality_id: 'SPC-003', name: 'Album Designer', active: true },
    { speciality_id: 'SPC-004', name: 'Photo Editor', active: true },
    { speciality_id: 'SPC-005', name: 'Wedding Photo Editor', active: true },
    { speciality_id: 'SPC-006', name: 'Cinematic Video Editor', active: true },
    { speciality_id: 'SPC-007', name: 'Color Grading Specialist', active: true },
    { speciality_id: 'SPC-008', name: 'Thumbnail Designer', active: true },
    { speciality_id: 'SPC-009', name: 'Motion Graphics Editor', active: true },
    { speciality_id: 'SPC-010', name: 'Short Film Editor', active: true },
    { speciality_id: 'SPC-011', name: 'Senior Editor', active: true },
    { speciality_id: 'SPC-012', name: 'QC Reviewer', active: true }
  ]);

  const [editorAssignments, setEditorAssignments] = useState<EditorAssignment[]>(() => {
    try {
      const saved = localStorage.getItem('erp_editor_assignments');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  });

  const [equipmentHandovers, setEquipmentHandovers] = useState<EquipmentHandover[]>([]);

  const [clientAcceptanceVerifications, setClientAcceptanceVerifications] = useState<ClientAcceptanceVerification[]>([]);
  const [isProductionDashboardActive, setIsProductionDashboardActive] = useState(false);















  // Track session/auth state in localStorage to keep developer/user logged-in across refreshes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('erp_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('erp_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('erp_role', currentRole);
    localStorage.setItem('erp_user_name', currentUserName);
    console.log("[CACHE SYNC EVENT] Stored current role and username");
  }, [currentRole, currentUserName]);

  // Helper to extract the latest status history record for a specific project
  const getLatestHistoryStatus = (orderId?: string | null, leadId?: string | null, trackingId?: string | null): { newStatus: string; oldStatus: string; createdAt: string } | null => {
    if (!statusHistory || !Array.isArray(statusHistory) || statusHistory.length === 0) return null;

    const ordStr = orderId ? String(orderId).trim() : '';
    const leadStr = leadId ? String(leadId).trim() : '';
    const trkStr = trackingId ? String(trackingId).trim() : '';

    const matching = statusHistory.filter(h => {
      if (!h || !h.new_status || h.old_status === 'NOTE') return false;
      const hNew = String(h.new_status).trim();
      if (!hNew) return false;

      const hOrd = h.order_id ? String(h.order_id).trim() : '';
      const hLead = h.lead_id ? String(h.lead_id).trim() : '';

      if (ordStr && hOrd && hOrd === ordStr) return true;
      if (leadStr && hLead && hLead === leadStr) return true;
      if (trkStr && ((hOrd && hOrd === trkStr) || (hLead && hLead === trkStr))) return true;

      return false;
    });

    if (matching.length === 0) return null;

    matching.sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const latest = matching[matching.length - 1];
    return {
      newStatus: String(latest.new_status).trim(),
      oldStatus: String(latest.old_status || '').trim(),
      createdAt: latest.created_at || ''
    };
  };

  // Authoritative status normalizer for production table workflow
  const normalizeProductionStatus = (
    editingStatus?: string, 
    currentStatus?: string, 
    productionStatus?: string,
    historyNewStatus?: string | null
  ) => {
    const norm = (s?: string | null) => String(s || '').trim();
    const lower = (s?: string | null) => norm(s).toLowerCase();

    const isClosed = (s?: string | null) => {
      const l = lower(s);
      return l === 'order closed' || l === 'order close' || l === 'closed' || l === 'close' || l === 'project closed' || l === 'completed' || l === 'project completed';
    };

    const isClientAcceptance = (s?: string | null) => {
      const l = lower(s);
      return l === 'client acceptance' || l === 'client accepted';
    };

    const isEditingCompleted = (s?: string | null) => {
      const l = lower(s);
      return l === 'editing completed' || l === 'editing complete';
    };

    // 1. Order Closed has highest priority
    if (isClosed(historyNewStatus) || isClosed(currentStatus) || isClosed(editingStatus) || isClosed(productionStatus)) {
      const closeLabel = (historyNewStatus && lower(historyNewStatus) === 'order close') || (currentStatus && lower(currentStatus) === 'order close') ? 'Order Close' : 'Order Closed';
      return {
        editing_status: 'Order Closed' as EditingStatus,
        current_status: closeLabel,
        production_status: 'Order Closed',
        is_closed: true
      };
    }

    // 2. Client Acceptance (NEVER allow Editing Completed to override Client Acceptance)
    if (isClientAcceptance(historyNewStatus) || isClientAcceptance(currentStatus) || isClientAcceptance(editingStatus) || isClientAcceptance(productionStatus)) {
      return {
        editing_status: 'Client Acceptance' as EditingStatus,
        current_status: 'Client Acceptance',
        production_status: 'Client Acceptance',
        is_closed: false
      };
    }

    // 3. Editing Completed
    if (isEditingCompleted(historyNewStatus) || isEditingCompleted(currentStatus) || isEditingCompleted(editingStatus) || isEditingCompleted(productionStatus)) {
      return {
        editing_status: 'Editing Completed' as EditingStatus,
        current_status: 'Editing Completed',
        production_status: 'Editing Completed',
        is_closed: false
      };
    }

    // 4. Follow latest history status if present and not Pending
    if (historyNewStatus && norm(historyNewStatus) !== '' && norm(historyNewStatus) !== 'Pending') {
      const s = norm(historyNewStatus);
      return {
        editing_status: s as EditingStatus,
        current_status: s,
        production_status: s,
        is_closed: false
      };
    }

    // 5. Follow current_status if present and not Pending
    if (currentStatus && norm(currentStatus) !== '' && norm(currentStatus) !== 'Pending') {
      const s = norm(currentStatus);
      return {
        editing_status: s as EditingStatus,
        current_status: s,
        production_status: s,
        is_closed: false
      };
    }

    // 6. Follow editing_status if present and not Pending
    if (editingStatus && norm(editingStatus) !== '' && norm(editingStatus) !== 'Pending') {
      const s = norm(editingStatus);
      return {
        editing_status: s as EditingStatus,
        current_status: s,
        production_status: s,
        is_closed: false
      };
    }

    // 7. Follow production_status if present and not Pending
    if (productionStatus && norm(productionStatus) !== '' && norm(productionStatus) !== 'Pending') {
      const s = norm(productionStatus);
      return {
        editing_status: s as EditingStatus,
        current_status: s,
        production_status: s,
        is_closed: false
      };
    }

    return {
      editing_status: 'Pending' as EditingStatus,
      current_status: 'Pending',
      production_status: 'Pending',
      is_closed: false
    };
  };

  const augmentedOrders = useMemo(() => {
    // Post-sales stages that should produce active orders
    const postSalesStages = [
      'New Order Received', 'Confirm Order', 'Order Confirmed', 'Operations Assigned', 'Assigned Crew', 'Staff Assigned', 'Event Scheduled',
      'Event Started', 'Event Start', 'Event Ended', 'Event End', 'Event Completed', 'Event Complete',
      'Footage Handover', 'Equipment Handover', 'Footage Handover Verified', 'Verified Footage', 'Raw Footage Received',
      'Editor Assigned', 'Assigned Editor', 'Editing Started', 'Editing In Progress', 'Internal QC Review', 'Client Review Sent', 'Internal Review', 'Client Review', 'Revision Required', 'Revision In Progress', 'Revision', 'Final Approval', 'Project Delivered', 'Project Closed',
      'Customer Review', 'Approved', 'Delivered', 'Payment Pending', 'Closed', 'Business Owner Review', 'Order Closed', 'Client Acceptance', 'Editing Completed'
    ];
    
    // Start with existing booked/restored orders from DB
    const list = [...orders];
    
    // For every lead, ensure a mapped order exists if the lead is confirmed
    leads.forEach(ld => {
      if (postSalesStages.includes(ld.status)) {
        const orderExists = list.some(o => o.lead_id === ld.lead_id || o.order_id === ld.lead_id);
        if (!orderExists) {
          const isNewFormat = ld.lead_id.match(/^(?:LD|LD-)?(\d+)$/i);
          const ordId = isNewFormat ? `OR${isNewFormat[1].padStart(3, '0')}` : `ORD-${ld.lead_id.replace(/\D/g, '') || ld.lead_id}`;
          list.push({
            order_id: ordId,
            lead_id: ld.lead_id,
            customer_name: ld.customer_name,
            mobile: ld.mobile,
            event_type: ld.event_type,
            event_date: ld.event_date,
            event_time: ld.event_time,
            reporting_time: ld.reporting_time || '08:00',
            event_location: ld.event_location,
            package_name: 'Custom Shoot Package',
            quotation_amount: ld.budget || 0,
            advance_received: 0,
            balance_amount: ld.budget || 0,
            order_status: 'Confirmed',
            current_stage: ld.status,
            sales_person: ld.sales_person || ld.created_by || 'Sales Team',
            events: ld.events,
            notes_special_customizations: ld.notes_special_customizations,
            deliverables_description: ld.deliverables_description,
            custom_event_name: ld.custom_event_name,
            created_at: ld.updated_at || new Date().toISOString()
          });
        }
      }
    });

    // Make sure we override fields so that the leads table remains the single source of truth for status, dates, etc.,
    // while honoring the authoritative production table status if present
    return list.map(o => {
      const parentLead = leads.find(l => l.lead_id === o.lead_id);
      let effectiveStage = (o.current_stage === 'Verified Footage' || parentLead?.status === 'Verified Footage' || parentLead?.current_status === 'Verified Footage')
        ? 'Verified Footage'
        : (parentLead?.status || o.current_stage);

      const matchingProds = production.filter(p => p.order_id === o.order_id || p.tracking_id === o.order_id || (p as any).lead_id === o.lead_id || p.tracking_id === o.lead_id);
      const latestHist = getLatestHistoryStatus(o.order_id, o.lead_id);
      const matchingAssigns = (editorAssignments || []).filter(a => 
        (o.order_id && (a.order_id === o.order_id || a.production_id === o.order_id)) ||
        (o.lead_id && (a.order_id === o.lead_id || a.production_id === o.lead_id))
      );

      if (matchingProds.length > 0 || latestHist || matchingAssigns.length > 0) {
        let bestNorm = normalizeProductionStatus(
          matchingProds[0]?.editing_status,
          matchingProds[0]?.current_status,
          matchingProds[0]?.production_status,
          latestHist?.newStatus
        );

        for (const mp of matchingProds) {
          const candidateNorm = normalizeProductionStatus(
            mp.editing_status,
            mp.current_status,
            mp.production_status,
            latestHist?.newStatus
          );
          if (candidateNorm.editing_status === 'Order Closed') {
            bestNorm = candidateNorm;
            break;
          } else if (candidateNorm.editing_status === 'Client Acceptance' && bestNorm.editing_status !== 'Order Closed') {
            bestNorm = candidateNorm;
          } else if (candidateNorm.editing_status === 'Editing Completed' && bestNorm.editing_status !== 'Order Closed' && bestNorm.editing_status !== 'Client Acceptance') {
            bestNorm = candidateNorm;
          }
        }

        if (matchingAssigns.length > 0 && bestNorm.editing_status !== 'Order Closed' && bestNorm.editing_status !== 'Client Acceptance') {
          const getTaskStageRank = (st: string, driveLink?: string) => {
            const s = st || '';
            if (['Client Accepted', 'Client Acceptance'].includes(s)) return 5;
            if (['Completed', 'Editing Completed', 'Editing Complete'].includes(s)) return 4;
            if (['Customer Review', 'Client Review', 'Client Review Sent'].includes(s) || (driveLink && driveLink.trim() !== '')) return 3;
            if (['Editing Started', 'Editing Start', 'In Progress', 'Editing In Progress'].includes(s)) return 2;
            if (['Assigned Editor', 'Editor Assigned', 'Assigned'].includes(s)) return 1;
            return 0;
          };
          const ranks = matchingAssigns.map(a => getTaskStageRank(a.status, (a as any).edited_drive_link));
          const minRank = Math.min(...ranks);
          if (minRank >= 5) {
            bestNorm = {
              editing_status: 'Client Acceptance' as EditingStatus,
              current_status: 'Client Acceptance',
              production_status: 'Client Acceptance',
              is_closed: false
            };
          } else if (minRank >= 4) {
            bestNorm = {
              editing_status: 'Editing Completed' as EditingStatus,
              current_status: 'Editing Completed',
              production_status: 'Editing Completed',
              is_closed: false
            };
          }
        }

        if (bestNorm.editing_status) {
          effectiveStage = bestNorm.editing_status as any;
        }
      }

      if (parentLead) {
        return {
          ...o,
          current_stage: effectiveStage,
          customer_name: parentLead.customer_name,
          mobile: parentLead.mobile,
          event_type: parentLead.event_type,
          event_date: parentLead.event_date,
          event_time: parentLead.event_time,
          reporting_time: parentLead.reporting_time || o.reporting_time,
          event_location: parentLead.event_location,
          quotation_amount: o.quotation_amount || parentLead.budget || 0,
          events: parentLead.events || o.events,
          notes_special_customizations: parentLead.notes_special_customizations || o.notes_special_customizations,
          deliverables_description: parentLead.deliverables_description || o.deliverables_description,
          custom_event_name: parentLead.custom_event_name || o.custom_event_name
        };
      }
      return {
        ...o,
        current_stage: effectiveStage
      };
    }).filter(o => {
      // STOLID FIX: Ensure ONLY confirmed bookings with valid post-sales stages stay in the orders list
      const parentLead = leads.find(l => l.lead_id === o.lead_id);
      if (!parentLead) return true; // Keep orphaned orders just in case
      const isBookingConfirmed = parentLead.booking_status === 'Confirmed' || o.order_status === 'Confirmed' || o.order_status === 'Completed' || o.order_status === 'Delivered' || o.order_status === 'Closed';
      return postSalesStages.includes(parentLead.status) && isBookingConfirmed;
    });
  }, [orders, leads, production, statusHistory]);

  const augmentedOperations = useMemo(() => {
    const list = [...operations];
    augmentedOrders.forEach(o => {
      const opExists = list.some(op => op.order_id === o.order_id);
      if (!opExists) {
        list.push({
          operation_id: `OP-${o.order_id}`,
          order_id: o.order_id,
          photographer_assigned: 'Unassigned',
          videographer_assigned: 'Unassigned',
          drone_operator_assigned: 'Unassigned',
          assistant_assigned: 'Unassigned',
          equipment_kit: '',
          reporting_time: o.reporting_time || '08:00',
          event_status: o.current_stage,
          updated_by: 'System',
          consolidated_drive_link: (o as any).consolidated_drive_link || o.raw_footage_link || '',
          Consolidated_Drive_Link: (o as any).consolidated_drive_link || o.raw_footage_link || '',
          raw_footage_drive_link: o.raw_footage_link || ''
        });
      }
    });
    return list.map(op => {
      const ord = augmentedOrders.find(o => o.order_id === op.order_id);
      const rf = rawFootage.find(f => f.order_id === op.order_id || f.tracking_id === op.order_id);
      const linkFallback = (ord as any)?.consolidated_drive_link || ord?.raw_footage_link || rf?.server_path || '';
      const finalConsolidatedLink = op.consolidated_drive_link || op.Consolidated_Drive_Link || linkFallback || '';
      if (ord) {
        return {
          ...op,
          event_status: ord.current_stage,
          reporting_time: ord.reporting_time || op.reporting_time,
          consolidated_drive_link: finalConsolidatedLink,
          Consolidated_Drive_Link: finalConsolidatedLink
        };
      }
      return {
        ...op,
        consolidated_drive_link: finalConsolidatedLink,
        Consolidated_Drive_Link: finalConsolidatedLink
      };
    });
  }, [operations, augmentedOrders, rawFootage]);

  const augmentedProduction = useMemo(() => {
    // 1. Map existing production records to ensure order_id and lead_id are resolved
    const rawList: Production[] = production.map(p => {
      let order_id = (p as any).order_id;
      let lead_id = (p as any).lead_id;

      if (!order_id) {
        const matchingOrd = augmentedOrders.find(o => o.order_id === p.tracking_id || o.lead_id === p.tracking_id);
        if (matchingOrd) {
          order_id = matchingOrd.order_id;
          lead_id = lead_id || matchingOrd.lead_id;
        }
      }
      if (!lead_id && order_id) {
        const matchingOrd = augmentedOrders.find(o => o.order_id === order_id);
        if (matchingOrd) {
          lead_id = matchingOrd.lead_id;
        }
      }

      // Resolve delivery method from validated_server_uploads, direct fields, or clientAcceptanceVerifications
      const valUploads = (p as any).validated_server_uploads && typeof (p as any).validated_server_uploads === 'object'
        ? (p as any).validated_server_uploads
        : {};
      const effOrderId = order_id || (p as any).order_id || p.tracking_id;
      const matchingCaVerif = (clientAcceptanceVerifications || []).find(v =>
        (effOrderId && String(v.order_id || '').toLowerCase() === String(effOrderId).toLowerCase()) ||
        (p.tracking_id && String(v.order_id || '').toLowerCase() === String(p.tracking_id).toLowerCase()) ||
        (p.production_id && String(v.order_id || '').toLowerCase() === String(p.production_id).toLowerCase())
      );
      const delivery_method = p.delivery_method || valUploads.delivery_method || matchingCaVerif?.delivery_method || (p.delivery_link ? 'server_link' : undefined);
      const server_link = p.server_link || valUploads.server_link || matchingCaVerif?.server_link || (delivery_method === 'server_link' ? (p.delivery_link || matchingCaVerif?.final_edited_footage_link || matchingCaVerif?.upload_link_path || '') : '');
      const physical_drive_details = p.physical_drive_details || valUploads.physical_drive_details || matchingCaVerif?.physical_drive_details || (delivery_method === 'physical_drive' ? (matchingCaVerif?.folder_name || '') : '');

      return {
        ...p,
        order_id: order_id || (p as any).order_id,
        lead_id: lead_id || (p as any).lead_id,
        delivery_method: delivery_method as any,
        server_link: server_link,
        physical_drive_details: physical_drive_details
      };
    });

    // 2. Synthesize missing production records ONLY for orders that have genuinely reached the production workflow
    const productionWorkflowStages = [
      'Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Raw Footage Uploaded',
      'Assigned Editor', 'Editor Assigned', 'Assigned',
      'Editing Started', 'Editing In Progress', 'Editing', 'Internal QC Review',
      'Customer Review', 'Client Review Sent', 'Ready For Review', 'Revision Required', 'Revision In Progress',
      'Editing Completed', 'Editing Complete', 'Final Approval',
      'Client Acceptance', 'Client Accepted', 'Order Closed', 'Closed', 'Completed', 'Project Closed', 'Approved', 'Payment Pending'
    ];

    augmentedOrders.forEach(o => {
      const prodExists = rawList.some(p => 
        p.tracking_id === o.order_id || 
        p.tracking_id === o.lead_id ||
        (p as any).order_id === o.order_id ||
        (p as any).lead_id === o.lead_id
      );
      if (!prodExists) {
        const parentLeadForO = leads.find(l => l.lead_id === o.lead_id);
        const stageNorm = (o.current_stage || parentLeadForO?.status || (parentLeadForO as any)?.current_status || '').trim();
        const rfForO = rawFootage.find(rf => rf.order_id === o.order_id || rf.tracking_id === o.order_id);
        const hasVerifiedRf = !!rfForO && (rfForO.raw_received === true || rfForO.status === 'Received');
        const hasEditorAssignments = (editorAssignments || []).some(ea => ea.order_id === o.order_id || (o.lead_id && ea.order_id === o.lead_id));
        const isPostVerifiedStage = productionWorkflowStages.includes(stageNorm);

        // Critical: Do NOT synthesize production records for leads still in Sales or Operations stages
        if (!isPostVerifiedStage && !hasVerifiedRf && !hasEditorAssignments) {
          return;
        }

        const defaultTargetDate = parentLeadForO?.delivery_target_date || '';
        const opForO = operations.find(op => op.order_id === o.order_id);
        
        const extractVerifiedFromText = (text?: string | null): string => {
          if (!text || typeof text !== 'string') return '';
          const m = text.match(/Verified\s+Footage\s+with\s+Consolidated\s+Link:\s*(https?:\/\/[^\s\n\r"']+)/i) ||
                    text.match(/Consolidated\s+(?:Drive\s+)?Link:\s*(https?:\/\/[^\s\n\r"']+)/i);
          return m ? m[1].trim() : '';
        };

        const link = opForO?.consolidated_drive_link || 
                     opForO?.Consolidated_Drive_Link || 
                     extractVerifiedFromText(opForO?.remarks) || 
                     extractVerifiedFromText(opForO?.upload_notes_remarks) || 
                     extractVerifiedFromText(rfForO?.upload_notes) || 
                     (o as any).consolidated_drive_link || 
                     opForO?.raw_footage_drive_link || 
                     rfForO?.server_path || 
                     o.raw_footage_link || '';

        rawList.push({
          production_id: `PRD-${o.lead_id}`,
          tracking_id: o.order_id,
          order_id: o.order_id,
          lead_id: o.lead_id,
          editor_assigned: parentLeadForO?.assigned_editor || 'Unassigned',
          raw_footage_location: link,
          final_consolidated_drive_link: link,
          consolidated_drive_link: link,
          editing_status: (parentLeadForO?.current_status || parentLeadForO?.status || o.current_stage || 'Pending') as any,
          current_status: (parentLeadForO?.current_status || parentLeadForO?.status || o.current_stage || 'Pending') as any,
          production_status: (parentLeadForO?.current_status || parentLeadForO?.status || o.current_stage || 'Pending') as any,
          remarks: '',
          project_priority: 'Medium',
          target_delivery_date: defaultTargetDate,
          expected_delivery_date: defaultTargetDate
        } as any);
      }
    });

    // 3. For any project that has multiple production records (e.g. PRD-LD002 and PRD-123232),
    // find the authoritative status from the production table and lead_status_history,
    // and synchronize all records of that project.
    const projectStatusMap = new Map<string, { editing_status: EditingStatus; current_status: string; production_status: string; is_closed: boolean }>();

    rawList.forEach(p => {
      const orderId = (p as any).order_id || (p.tracking_id?.startsWith('OR') ? p.tracking_id : undefined);
      const leadId = (p as any).lead_id || (p.tracking_id?.startsWith('LD') ? p.tracking_id : undefined);
      const trackingId = p.tracking_id;

      const matchingProds = rawList.filter(other => 
        (orderId && ((other as any).order_id === orderId || other.tracking_id === orderId)) ||
        (leadId && ((other as any).lead_id === leadId || other.tracking_id === leadId)) ||
        (trackingId && (other.tracking_id === trackingId || (other as any).order_id === trackingId || (other as any).lead_id === trackingId))
      );

      const latestHist = getLatestHistoryStatus(orderId, leadId, trackingId);

      let bestNorm = normalizeProductionStatus(
        p.editing_status,
        p.current_status,
        p.production_status,
        latestHist?.newStatus
      );

      for (const mp of matchingProds) {
        const candidateNorm = normalizeProductionStatus(
          mp.editing_status,
          mp.current_status,
          mp.production_status,
          latestHist?.newStatus
        );
        if (candidateNorm.editing_status === 'Order Closed') {
          bestNorm = candidateNorm;
          break;
        } else if (candidateNorm.editing_status === 'Client Acceptance' && bestNorm.editing_status !== 'Order Closed') {
          bestNorm = candidateNorm;
        } else if (candidateNorm.editing_status === 'Editing Completed' && bestNorm.editing_status !== 'Order Closed' && bestNorm.editing_status !== 'Client Acceptance') {
          bestNorm = candidateNorm;
        }
      }

      // Also check editor assignments for this project/order
      const matchingAssigns = (editorAssignments || []).filter(a => 
        a.production_id === p.production_id ||
        (orderId && (a.order_id === orderId || a.production_id === orderId)) ||
        (leadId && (a.order_id === leadId || a.production_id === leadId)) ||
        (trackingId && (a.order_id === trackingId || a.production_id === trackingId))
      );

      if (matchingAssigns.length > 0 && bestNorm.editing_status !== 'Order Closed' && bestNorm.editing_status !== 'Client Acceptance') {
        const getTaskStageRank = (st: string, driveLink?: string) => {
          const s = st || '';
          if (['Client Accepted', 'Client Acceptance'].includes(s)) return 5;
          if (['Completed', 'Editing Completed', 'Editing Complete'].includes(s)) return 4;
          if (['Customer Review', 'Client Review', 'Client Review Sent'].includes(s) || (driveLink && driveLink.trim() !== '')) return 3;
          if (['Editing Started', 'Editing Start', 'In Progress', 'Editing In Progress'].includes(s)) return 2;
          if (['Assigned Editor', 'Editor Assigned', 'Assigned'].includes(s)) return 1;
          return 0;
        };

        const ranks = matchingAssigns.map(a => getTaskStageRank(a.status, (a as any).edited_drive_link));
        const minRank = Math.min(...ranks);

        if (minRank >= 5) {
          bestNorm = {
            editing_status: 'Client Acceptance' as EditingStatus,
            current_status: 'Client Acceptance',
            production_status: 'Client Acceptance',
            is_closed: false
          };
        } else if (minRank >= 4) {
          bestNorm = {
            editing_status: 'Editing Completed' as EditingStatus,
            current_status: 'Editing Completed',
            production_status: 'Editing Completed',
            is_closed: false
          };
        } else if (minRank >= 3 && (bestNorm.editing_status === 'Assigned Editor' || bestNorm.editing_status === 'Editing Started' || bestNorm.editing_status === 'Verified Footage')) {
          bestNorm = {
            editing_status: 'Customer Review' as EditingStatus,
            current_status: 'Customer Review',
            production_status: 'Customer Review',
            is_closed: false
          };
        }
      }

      if (orderId) projectStatusMap.set(orderId, bestNorm);
      if (leadId) projectStatusMap.set(leadId, bestNorm);
      if (trackingId) projectStatusMap.set(trackingId, bestNorm);
      if (p.production_id) projectStatusMap.set(p.production_id, bestNorm);
    });

    return rawList.map(p => {
      const orderId = (p as any).order_id || (p.tracking_id?.startsWith('OR') ? p.tracking_id : undefined);
      const leadId = (p as any).lead_id || (p.tracking_id?.startsWith('LD') ? p.tracking_id : undefined);
      const trackingId = p.tracking_id;

      const syncedStatus = 
        (orderId && projectStatusMap.get(orderId)) ||
        (leadId && projectStatusMap.get(leadId)) ||
        (trackingId && projectStatusMap.get(trackingId)) ||
        (p.production_id && projectStatusMap.get(p.production_id));

      const finalStatus = syncedStatus || normalizeProductionStatus(
        p.editing_status, 
        p.current_status, 
        p.production_status, 
        getLatestHistoryStatus(orderId, leadId, trackingId)?.newStatus
      );

      const ord = augmentedOrders.find(o => o.order_id === p.tracking_id || o.lead_id === p.tracking_id || o.order_id === (p as any).order_id || o.lead_id === (p as any).lead_id);
      const parentLead = leads.find(l => l.lead_id === p.tracking_id || (ord && l.lead_id === ord.lead_id) || l.lead_id === (p as any).lead_id);
      const op = operations.find(o => (ord && o.order_id === ord.order_id) || o.order_id === p.tracking_id || (p as any).order_id === o.order_id);
      const rf = rawFootage.find(f => (ord && f.order_id === ord.order_id) || f.order_id === p.tracking_id || f.tracking_id === p.tracking_id);
      
      const leadEditor = parentLead?.assigned_editor;
      const leadEditors = parentLead?.assigned_editors;
      const leadTargetDate = parentLead?.delivery_target_date;

      let updatedP = { 
        ...p,
        order_id: (p as any).order_id || ord?.order_id,
        lead_id: (p as any).lead_id || ord?.lead_id || parentLead?.lead_id,
        events: (p as any).events || ord?.events || parentLead?.events,
        notes_special_customizations: (p as any).notes_special_customizations || ord?.notes_special_customizations || parentLead?.notes_special_customizations,
        deliverables_description: (p as any).deliverables_description || ord?.deliverables_description || parentLead?.deliverables_description,
        custom_event_name: (p as any).custom_event_name || ord?.custom_event_name || parentLead?.custom_event_name,
        editing_status: finalStatus.editing_status,
        current_status: finalStatus.current_status,
        production_status: finalStatus.production_status,
        status: finalStatus.editing_status as any
      };

      const extractVerifiedFromText = (text?: string | null): string => {
        if (!text || typeof text !== 'string') return '';
        const m = text.match(/Verified\s+Footage\s+with\s+Consolidated\s+Link:\s*(https?:\/\/[^\s\n\r"']+)/i) ||
                  text.match(/Consolidated\s+(?:Drive\s+)?Link:\s*(https?:\/\/[^\s\n\r"']+)/i);
        return m ? m[1].trim() : '';
      };

      const verifiedFromNotes = extractVerifiedFromText(p.project_notes) || 
                                extractVerifiedFromText(p.remarks) || 
                                extractVerifiedFromText(op?.remarks) || 
                                extractVerifiedFromText(op?.upload_notes_remarks) || 
                                extractVerifiedFromText(rf?.upload_notes);

      const resolvedLink = verifiedFromNotes ||
                           op?.consolidated_drive_link || 
                           op?.Consolidated_Drive_Link || 
                           (p as any).final_consolidated_drive_link || 
                           (p as any).consolidated_drive_link || 
                           (ord as any)?.consolidated_drive_link ||
                           p.raw_footage_location || 
                           op?.raw_footage_drive_link || 
                           rf?.server_path || 
                           ord?.raw_footage_link || '';

      if (resolvedLink) {
        (updatedP as any).final_consolidated_drive_link = resolvedLink;
        (updatedP as any).consolidated_drive_link = resolvedLink;
        updatedP.raw_footage_location = resolvedLink;
      }

      if (leadEditor && leadEditor !== 'Unassigned') {
        updatedP.editor_assigned = leadEditor;
      }
      if (leadEditors) {
        updatedP.assigned_staff = leadEditors;
      }
      if (leadTargetDate) {
        updatedP.target_delivery_date = leadTargetDate;
        updatedP.expected_delivery_date = leadTargetDate;
      }

      return updatedP;
    });
  }, [production, augmentedOrders, leads, operations, rawFootage, statusHistory, editorAssignments]);

  const augmentedEditorAssignments = useMemo(() => {
    return (editorAssignments || []).map(a => {
      let rawStatus = a.status || 'Assigned Editor';
      if (rawStatus === 'Editing Complete') rawStatus = 'Editing Completed';
      return {
        ...a,
        status: rawStatus
      };
    });
  }, [editorAssignments]);

  const augmentedPayments = useMemo(() => {
    const list = [...payments];
    augmentedOrders.forEach(o => {
      const payExists = list.some(p => p.order_id === o.order_id);
      if (!payExists) {
        list.push({
          payment_id: `PAY-${o.order_id}`,
          order_id: o.order_id,
          quotation_amount: o.quotation_amount,
          advance_received: o.advance_received || 0,
          final_payment_received: 0,
          balance_due: o.balance_amount || o.quotation_amount,
          payment_status: 'Pending'
        });
      }
    });
    return list.map(p => {
      const ord = augmentedOrders.find(o => o.order_id === p.order_id);
      if (ord) {
        const adv = ord.advance_received || 0;
        const totalPaid = adv + (p.final_payment_received || 0);
        const bal = ord.quotation_amount - totalPaid;
        return {
          ...p,
          quotation_amount: ord.quotation_amount,
          advance_received: adv,
          balance_due: bal >= 0 ? bal : 0,
          payment_status: totalPaid >= ord.quotation_amount ? 'Fully Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Pending') as any
        };
      }
      return p;
    });
  }, [payments, augmentedOrders]);

  // Helper to strip non-database properties like customer_id before saving to Supabase
  const stripClientOnlyFields = (table: string, record: any) => {
    if (!record || typeof record !== 'object') return record;
    
    let cloned = { ...record };
    delete cloned.customer_id;

    if (table === 'leads') {
      delete cloned.Specify_Custom_Lead_Source_Name;
      if (cloned.lost_reason !== undefined && cloned.Lost_Reason === undefined) {
        cloned.Lost_Reason = cloned.lost_reason;
      }
      delete cloned.lost_reason;
      if (cloned.lost_notes !== undefined && cloned.Lost_Notes === undefined) {
        cloned.Lost_Notes = cloned.lost_notes;
      }
      delete cloned.lost_notes;
    }

    if (table === 'raw_footage') {
      delete cloned.storage_type;
      delete cloned.upload_notes;
    }

    if (table === 'payment_history') {
      delete cloned.payment_history_id;
      delete cloned.lead_id;
    }

    if (table === 'users') {
      cloned.full_name = cloned.full_name || cloned.name;
      cloned.name = cloned.name || cloned.full_name;
      cloned.phone = cloned.phone || cloned.mobile;
      cloned.mobile = cloned.mobile || cloned.phone;
      delete cloned.employee_id;
    }

    if (table === 'operations_staff') {
      const existing = staff.find(s => s.staff_id === record.staff_id);
      const merged = existing ? { ...existing, ...cloned } : cloned;
      
      const extra: any = {};
      const localKeys = ['whatsapp_number', 'production_role_speciality', 'custom_role_specialty', 'experience', 'employee_id', 'address', 'city', 'phone', 'commission_rate', 'rating', 'bio', 'Skill', 'Staff_Type'];
      for (const k of localKeys) {
        if (k in merged) {
          extra[k] = merged[k];
        }
      }

      if (merged.role) {
        extra.role = merged.role;
      }
      extra.notes = (merged.notes && !merged.notes.trim().startsWith('{')) ? merged.notes : (extra.notes || merged.notes || '');

      const mapToDbStaffRole = (role: string): string => {
        const r = (role || '').trim().toLowerCase();
        if (r.includes('photographer')) return 'Photographer';
        if (r.includes('videographer')) return 'Videographer';
        if (r.includes('drone') || r.includes('aerial')) return 'Drone Operator';
        if (r.includes('editor')) return 'Coordinator';
        if (r.includes('assistant')) return 'Assistant';
        if (r.includes('coordinator')) return 'Coordinator';
        if (r.includes('manager')) return 'Manager';
        return 'Photographer';
      };

      const dbRole = mapToDbStaffRole(merged.role || 'Production Assistant');
      
      cloned = {
        staff_id: merged.staff_id,
        name: merged.name,
        mobile: merged.mobile,
        email: merged.email,
        role: dbRole,
        department: merged.department || 'Operations',
        status: merged.status || 'Active',
        joining_date: merged.joining_date || new Date().toISOString().split('T')[0],
        profile_photo: merged.profile_photo || '',
        notes: JSON.stringify(extra),
        created_at: merged.created_at || new Date().toISOString(),
        Skill: Array.isArray(merged.Skill) ? merged.Skill : (typeof merged.Skill === 'string' ? merged.Skill.split(',').map(s => s.trim()).filter(Boolean) : []),
        Staff_Type: merged.Staff_Type || merged.staff_type || 'In-House'
      } as any;

      // Only add extra fields if they are explicitly in the record and we want to try saving them as columns
      // But based on user request, let's stick to the 11 core fields and put the rest in notes if needed.
      // However, the DB might have these columns, so we can keep them if they are in allowedColumns.
      for (const k of localKeys) {
        if (k in merged) {
          cloned[k] = merged[k];
        }
      }
    }

    if (table === 'production') {
      if (cloned.delivery_method || cloned.server_link || cloned.physical_drive_details) {
        const valUploads = (cloned.validated_server_uploads && typeof cloned.validated_server_uploads === 'object') ? { ...cloned.validated_server_uploads } : {};
        if (cloned.delivery_method === 'server_link') {
          delete (valUploads as any).physical_drive_details;
          valUploads.delivery_method = 'server_link';
          if (cloned.server_link) {
            valUploads.server_link = cloned.server_link;
          }
        } else if (cloned.delivery_method === 'physical_drive') {
          delete (valUploads as any).server_link;
          valUploads.delivery_method = 'physical_drive';
          if (cloned.physical_drive_details) {
            valUploads.physical_drive_details = cloned.physical_drive_details;
          }
        } else {
          if (cloned.delivery_method) valUploads.delivery_method = cloned.delivery_method;
          if (cloned.server_link) valUploads.server_link = cloned.server_link;
          if (cloned.physical_drive_details) valUploads.physical_drive_details = cloned.physical_drive_details;
        }
        cloned.validated_server_uploads = valUploads;
        if (cloned.delivery_method === 'server_link' && cloned.server_link) {
          cloned.delivery_link = cloned.server_link;
          cloned.upload_link_path = cloned.server_link;
          cloned.final_edited_footage_link = cloned.server_link;
        } else if (cloned.delivery_method === 'physical_drive') {
          cloned.delivery_link = '';
          cloned.upload_link_path = '';
          cloned.final_edited_footage_link = '';
          if (cloned.physical_drive_details && !cloned.folder_name) {
            cloned.folder_name = cloned.physical_drive_details;
          }
        }
        delete cloned.delivery_method;
        delete cloned.server_link;
        delete cloned.physical_drive_details;
      }
    }

    if (table === 'equipment') {
      cloned.Equipment_Category = cloned.equipment_type || cloned.Equipment_Category || 'Camera';
      cloned.Equipment_Status = cloned.status || cloned.Equipment_Status || 'Active';
    }

    if (table === 'leads') {
      if (cloned.selected_package_id && !cloned.Select_Package_Option) {
        cloned.Select_Package_Option = cloned.selected_package_id;
      }
      delete cloned.selected_package_id;
    }

    const allowedColumns: Record<string, string[]> = {
      users: ['id', 'email', 'role', 'name', 'full_name', 'mobile', 'phone', 'active', 'created_at', 'password', 'username', 'status'],
      leads: [
        'lead_id', 'created_date', 'lead_source', 'customer_name', 'mobile', 'alternate_mobile', 
        'email', 'event_type', 'custom_event_type', 'custom_event_name', 'shoot_type', 'event_date', 'event_time', 'event_location', 'budget', 
        'sales_person', 'status', 'remarks', 'created_by', 'updated_by', 'updated_at', 
        'assigned_editor', 'assigned_editors', 'production_role', 'delivery_target_date', 'current_status',
        'whatsapp_number', 'address', 'client_residence_address', 'city', 'state', 'pincode', 'desired_event_shoot_type', 'Select_Package_Option',
        'total_pax', 'reference_source', 
        'lead_value', 'lead_score', 'booking_status', 'reporting_time', 'Reporting_date', 'package_price', 'deliverables_description', 
        'Team_member', 'Team_Members', 'team_members', 'Team_members', 'team_member',
        'notes_special_customizations', 'quotation_discount', 'additional_services_cost', 'Quotation_Discount', 'Additional_Services_Cost', 'Specify_Custom_Lead_Source_Name', 'Final_Quotation_Amount', 'Final_Package_Amount', 'final_package_amount', 'advance_collected', 'booking_date', 'booking_time', 'payment_mode', 'transaction_id', 'contract_notes', 'quotation_locked', 'package_name', 'sales_staff_name', 'sales_staff_mobile',
        'Lost_Reason', 'Lost_Notes'
      ],
      orders: [
        'order_id', 'lead_id', 'customer_name', 'mobile', 'event_type', 'custom_event_type', 'custom_event_name', 'shoot_type', 'event_date', 
        'event_time', 'event_location', 'package_name', 'quotation_amount', 'advance_received', 
        'balance_amount', 'order_status', 'current_stage', 'sales_person', 'created_at', 
        'updated_by', 'updated_at', 'whatsapp_number', 'client_residence_address', 'city', 'state', 'pincode', 'Select_Package_Option', 
        'desired_event_shoot_type', 'reporting_time', 'Reporting_date', 'package_price', 'deliverables_description', 
        'Team_member', 'Team_Members', 'team_members', 'Team_members', 'team_member',
        'notes_special_customizations', 'quotation_discount', 'additional_services_cost', 'Quotation_Discount', 'Additional_Services_Cost', 'Specify_Custom_Lead_Source_Name', 'Final_Quotation_Amount',
        'total_pax', 'reference_source', 'lead_value', 'lead_score', 'booking_status'
      ],
      operations: [
        'operation_id', 'order_id', 'photographer_assigned', 'videographer_assigned', 
        'drone_operator_assigned', 'assistant_assigned', 'equipment_kit', 'equipment_allocated', 'reporting_time', 
        'event_status', 'remarks', 'updated_by', 'Upload_Notes_Remarks', 'upload_notes_remarks',
        'Raw_Footage_Drive_Link', 'raw_footage_drive_link'
      ],
      quotations: [
        'quotation_id', 'lead_id', 'quotation_number', 'quotation_amount', 'discount_amount', 
        'tax_amount', 'final_amount', 'quotation_status', 'valid_until', 'terms_conditions', 
        'package_name', 'package_price', 'deliverables_description', 
        'notes_special_customizations', 'additional_services_cost', 
        'whatsapp_number', 'shoot_type', 'client_residence_address', 'city', 'state', 'pincode', 'desired_event_shoot_type', 'Select_Package_Option',
        'quotation_discount', 'total_pax', 'reference_source', 'lead_value', 'lead_score', 'booking_status',
        'created_at', 'created_by', 'updated_at'
      ],
      lead_packages: [
        'lead_package_id', 'lead_id', 'package_id', 'package_name', 'package_cost', 'quantity', 
        'total_amount', 'discount', 'final_amount', 'deliverables_description', 
        'notes_special_customizations', 'additional_services_cost', 'team_members', 'deliverables', 'editable_inclusions', 'editable_deliverables', 'created_at'
      ],
      raw_footage: [
        'tracking_id', 'order_id', 'event_completed_date', 'raw_received', 'server_path', 'drive_link',
        'uploaded_by', 'uploaded_date', 'status', 'assignment_id', 'event_id', 'event_name'
      ],
      production: [
        'production_id', 'tracking_id', 'editor_assigned', 'raw_footage_location', 
        'editing_start_date', 'expected_delivery_date', 'editing_status', 
        'customer_review_status', 'delivery_date', 'remarks', 'project_priority',
        'target_delivery_date', 'actual_delivery_date', 'assigned_staff', 'project_notes',
        'internal_comments', 'raw_footage_status', 'production_status', 'approval_status',
        'editing_progress', 'order_id', 'lead_id', 'customer_name',
        'event_id', 'assigned_team', 'final_consolidated_drive_link', 'current_status', 'created_at',
        'client_communication_proof', 'customer_communication_proof', 'confirmation_proof',
        'proof_url', 'proof_image', 'uploaded_proof',
        'server_upload_confirmed', 'server_upload_event_date', 'server_upload_folder_name', 'server_path',
        'edited_drive_link', 'server_upload_confirmed_at', 'server_upload_confirmed_by',
        'checklist_customer_acceptance', 'checklist_content_usage', 'checklist_footage_deleted_7_days',
        'checklist_payment_from_sales', 'checklist_edited_files_uploaded',
        'server_upload_validated', 'validated_server_uploads', 'customer_review_image',
        'delivery_link', 'client_communication_proof_name', 'proof_name', 'upload_name',
        'checklist_client_communication_proof', 'edited_folder_uploaded_to_server', 'status',
        'folder_name', 'final_edited_footage_link', 'upload_link_path', 'client_approval_date',
        'client_communication_consent_proof', 'proof_file_name', 'updated_at'
      ],
      client_acceptance_verifications: [
        'id', 'order_id', 'event_id', 'client_communication_consent_proof',
        'folder_name', 'upload_link_path', 'final_edited_footage_link', 'edited_folder_uploaded_to_server', 'proof_file_name', 'proof_storage_path',
        'consent_proof_verified', 'created_at', 'updated_at'
      ],
      payments: [
        'payment_id', 'order_id', 'quotation_amount', 'advance_received', 'balance_due', 
        'final_payment_received', 'payment_date', 'payment_proof_url', 'payment_status',
        'transaction_id', 'payment_type', 'payment_collection_status', 'additional_received'
      ],
      activity_logs: [
        'log_id', 'user_name', 'role', 'action', 'module', 'record_id', 'timestamp', 
        'previous_stage', 'new_stage'
      ],
      staff_assignments: [
        'assignment_id', 'order_id', 'lead_id', 'task_id', 'slot_number', 'staff_role', 'staff_id', 'staff_name',
        'assignment_date', 'assignment_status', 'task_status', 'raw_footage_link',
        'event_id', 'event_name', 'event_date', 'reporting_time',
        'equipment', 'assigned_equipment', 'equipment_details', 'mobile', 'staff_type',
        'updated_at', 'updated_by', 'equipment_received_photo', 'equipment_handover_photo',
        'equipment_handover_notes', 'equipment_handover_to', 'event_start_photo', 'event_start_time',
        'event_end_photo', 'event_end_time', 'proofs', 'notes', 'remarks', 'created_at'
      ],
      staff_task_submissions: [
        'id', 'assignment_id', 'order_id', 'lead_id', 'event_id', 'event_name',
        'staff_id', 'staff_name', 'staff_role', 'submission_type', 'task_status',
        'photo_url', 'proof_photos', 'raw_footage_link', 'handover_to',
        'handover_notes', 'equipment_name', 'asset_id', 'remarks', 'created_at'
      ],
      lead_status_history: [
        'id', 'lead_id', 'order_id', 'old_status', 'new_status', 'changed_by', 'changed_by_role', 'remarks', 'created_at'
      ],
      lead_staff_assignment_history: [
        'history_id', 'lead_id', 'order_id', 'assigned_role', 'assigned_staff', 'assigned_by', 'assigned_at'
      ],
      lead_equipment_history: [
        'id', 'lead_id', 'order_id', 'assignment_id', 'equipment_name', 'equipment_serial', 'equipment_status', 'assigned_to_name', 'assigned_to_id', 'assigned_at', 'returned_by', 'returned_at', 'condition_on_return', 'remarks', 'photo_url', 'asset_id', 'event_id', 'event_name', 'proof_type', 'created_at', 'updated_at'
      ],
      equipment_handovers: [
        'handover_id', 'order_id', 'equipment_name', 'return_status', 'return_date', 'returned_by', 'notes', 'created_at'
      ],
      notifications: [
        'notification_id', 'title', 'message', 'sender_name', 'sender_role', 'timestamp', 
        'is_read', 'recipient_role'
      ],
      equipment: [
        'equipment_id', 'id', 'name', 'equipment_name', 'category', 'brand', 'model', 'serial_number', 'status', 'current_holder_name', 'current_order_id', 'condition', 'notes', 'Equipment_Category', 'Equipment_Status', 'created_at', 'updated_at'
      ],
      editor_assignments: [
        'assignment_id', 'production_id', 'staff_id', 'staff_name', 'speciality', 
        'assigned_date', 'target_finish_date', 'status', 'created_at', 'event_id', 
        'order_id', 'deliverable_id', 'Edited_Drive_Link', 'edited_drive_link',
        'confirmation_proof', 'customer_communication_proof', 'client_communication_proof',
        'customer_review_image', 'proof_url', 'proof_image', 'uploaded_proof',
        'customer_proof', 'client_proof', 'remarks', 'notes',
        'server_upload_confirmed', 'server_upload_event_date', 'server_upload_folder_name',
        'server_upload_confirmed_at', 'server_upload_confirmed_by',
        'edited_folder_uploaded_to_server', 'server_upload_validated',
        'server_upload_validated_at', 'server_upload_validated_by',
        'server_file_link', 'upload_link', 'folder_name', 'upload_link_path'
      ],
      operations_staff: [
        'staff_id', 'name', 'mobile', 'whatsapp_number', 'email', 'role', 'department', 'status', 'joining_date', 
        'profile_photo', 'notes', 'production_role_speciality', 'experience', 'employee_id', 'city', 'Skill', 'Staff_Type',
        'created_by', 'updated_by', 'created_at', 'updated_at'
      ],
      lead_events: [
        'id', 'lead_id', 'event_type', 'event_name', 'event_shoot_type', 'event_date', 
        'event_end_date', 'event_start_time', 'event_end_time', 'event_location', 
        'google_maps_link', 'guest_pax', 'staff_pax', 'assigned_staff_names', 
        'assigned_staff_mobiles', 'assigned_equipment', 'reporting_date', 'reporting_time',
        'created_at', 'updated_at'
      ]
    };

    if (table === 'lead_events' && cloned) {
      if (cloned.Reporting_date && !cloned.reporting_date) {
        cloned.reporting_date = cloned.Reporting_date;
      }
      delete cloned.Reporting_date;
      delete cloned.Event_End_Date;
    }

    if (table === 'payments' && cloned) {
      if (!cloned.payment_type && (cloned.Payment_type || cloned['Payment_type'] || cloned['Payment Type'])) {
        cloned.payment_type = cloned.payment_type || cloned.Payment_type || cloned['Payment_type'] || cloned['Payment Type'];
      }
      if (!cloned.transaction_id && (cloned['Transaction ID'] || cloned['Transaction_ID'] || cloned.transactionId)) {
        cloned.transaction_id = cloned.transaction_id || cloned['Transaction ID'] || cloned['Transaction_ID'] || cloned.transactionId;
      }
    }

    if (table === 'staff_assignments' && cloned) {
      if (Array.isArray(cloned.equipment)) {
        cloned.equipment = cloned.equipment.length > 0 ? cloned.equipment : null;
      } else if (typeof cloned.equipment === 'string') {
        const trimmed = cloned.equipment.trim();
        cloned.equipment = trimmed ? trimmed.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
      }
      if (Array.isArray(cloned.assigned_equipment)) {
        cloned.assigned_equipment = cloned.assigned_equipment.length > 0 ? cloned.assigned_equipment : null;
      } else if (typeof cloned.assigned_equipment === 'string') {
        const trimmed = cloned.assigned_equipment.trim();
        cloned.assigned_equipment = trimmed ? trimmed.split(',').map((s: string) => s.trim()).filter(Boolean) : null;
      }
      const varchar50Cols = ['assignment_id', 'task_id', 'order_id', 'lead_id', 'staff_id', 'assignment_status', 'task_status', 'reporting_time', 'staff_type', 'event_id', 'updated_by'];
      for (const vCol of varchar50Cols) {
        if (typeof cloned[vCol] === 'string' && cloned[vCol].length > 50) {
          cloned[vCol] = cloned[vCol].substring(0, 50);
        }
      }

      if (cloned.assignment_status) {
        const allowedAssignmentStatuses = new Set([
          'Assigned', 'Completed', 'Event Started', 'Event Completed', 'Project Completed', 'Cancelled', 'Pending', 'In Progress', 'Rejected'
        ]);
        if (!allowedAssignmentStatuses.has(cloned.assignment_status)) {
          if (['Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Delivered', 'Project Delivered', 'Closed', 'Order Closed'].includes(cloned.assignment_status)) {
            cloned.assignment_status = 'Completed';
          } else if (['Event Ended', 'Event End'].includes(cloned.assignment_status)) {
            cloned.assignment_status = 'Event Completed';
          } else if (['Event Started', 'Event Start'].includes(cloned.assignment_status)) {
            cloned.assignment_status = 'Event Started';
          } else {
            cloned.assignment_status = 'Assigned';
          }
        }
      }
    }

    const validCols = allowedColumns[table];
    if (validCols) {
      const sanitized: any = {};
      for (const col of validCols) {
        if (col in cloned) {
          sanitized[col] = cloned[col];
        }
      }
      return sanitized;
    }

    return cloned;
  };

  const verifyLeadsColumns = async (): Promise<{ success: boolean; error?: string }> => {
    return { success: true };
  };

  const isNumericColumnKey = (key: string): boolean => {
    if (!key || typeof key !== 'string') return false;
    const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const knownKeys = new Set([
      'budget', 'package_price', 'package_cost', 'quotation_amount',
      'quotation_discount', 'quotationdiscount',
      'additional_services_cost', 'additionalservicescost',
      'final_quotation_amount', 'finalquotationamount',
      'final_amount', 'final_package_amount', 'total_amount',
      'advance_received', 'advance_collected', 'advance_payment', 'advance_paid',
      'balance_amount', 'balance', 'total_pax', 'guest_pax', 'staff_pax',
      'lead_value', 'lead_score', 'pincode', 'tax_amount', 'subtotal',
      'grand_total', 'total_payment', 'contract_final_amount', 'advance_payment_received',
      'pending_amount', 'number_of_team_members', 'event_duration', 'quantity', 'discount',
      'price', 'cost', 'amount', 'rate', 'fee', 'whatsapp_number', 'mobile', 'alternate_mobile',
      'sales_staff_mobile'
    ]);
    if (knownKeys.has(key) || knownKeys.has(k)) return true;
    return (
      k.includes('amount') ||
      k.includes('cost') ||
      k.includes('price') ||
      k.includes('discount') ||
      k.includes('pax') ||
      k.includes('budget') ||
      k.includes('pincode') ||
      k.includes('zipcode') ||
      k.includes('balance') ||
      k.includes('advance') ||
      k.includes('score') ||
      k.includes('tax') ||
      k.includes('fee') ||
      k.includes('rate') ||
      k.includes('subtotal') ||
      k.includes('total') ||
      k.includes('duration') ||
      k.includes('quantity') ||
      k.endsWith('count')
    );
  };

  const sanitizeTimeFieldsForDb = (record: any, table?: string) => {
    if (!record || typeof record !== 'object') return record;
    const clone = { ...record };
    
    // Fallbacks for leads table not-null constraints
    if (table === 'leads') {
      if (clone.event_date === null || clone.event_date === '' || clone.event_date === undefined) {
         clone.event_date = new Date().toISOString().split('T')[0];
      }
      if (clone.event_time === null || clone.event_time === '' || clone.event_time === undefined) {
         clone.event_time = '12:00:00';
      }
    }

    const timeFields = ['event_time', 'reporting_time', 'confirmed_event_time'];
    const dateFields = [
      'event_date', 'booking_date', 'event_start_date', 'event_end_date', 'delivery_target_date',
      'editing_start_date', 'target_delivery_date', 'expected_delivery_date', 'actual_delivery_date', 
      'delivery_date', 'event_completed_date', 'uploaded_date', 'return_date', 'payment_date', 
      'follow_up_date', 'next_follow_up_date', 'client_approval_date', 'assigned_date', 
      'assignment_date', 'created_date', 'generated_date', 'p_generated_date', 'purchase_date', 
      'reporting_date', 'target_finish_date', 'server_upload_event_date', 
      'server_upload_confirmed_at', 'server_upload_validated_at'
    ];

    // Comprehensive numeric sanitization to ensure empty strings are NEVER sent to NUMERIC/DECIMAL/INT columns
    for (const key of Object.keys(clone)) {
      if (key.toLowerCase() === 'whatsapp_number') {
        const val = clone[key];
        if (val === '' || val === null || val === undefined || val === 'NaN' || val === 'null' || val === 'undefined') {
          clone[key] = null;
        } else {
          const digits = String(val).replace(/\D/g, '');
          clone[key] = digits ? Number(digits) : null;
        }
        continue;
      }
      if (isNumericColumnKey(key)) {
        const val = clone[key];
        const isPhone = key.includes('mobile') || key.includes('whatsapp') || key.includes('phone');
        if (val === '' || val === null || val === undefined || val === 'NaN' || val === 'null' || val === 'undefined') {
          clone[key] = (key === 'total_pax' && table === 'leads') ? 0 : null;
        } else if (typeof val === 'number') {
          if (isNaN(val)) {
            clone[key] = (key === 'total_pax' && table === 'leads') ? 0 : null;
          }
        } else if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed === '') {
            clone[key] = (key === 'total_pax' && table === 'leads') ? 0 : null;
          } else if (!isPhone) {
            const num = Number(trimmed);
            if (isNaN(num)) {
              clone[key] = null;
            } else {
              clone[key] = num;
            }
          }
        }
      }
    }

    for (const field of dateFields) {
      if (field in clone) {
        const val = clone[field];
        if (val === undefined || val === null || String(val).trim() === '') {
          clone[field] = null;
        }
      }
    }
    
    for (const field of timeFields) {
      if (field in clone) {
        const val = clone[field];
        if (val === undefined || val === null) {
          clone[field] = null;
        } else {
          const str = String(val).trim();
          if (str === '' || str === 'null' || str === 'undefined' || str === 'Invalid Date') {
            clone[field] = null;
          } else {
            try {
              const ampmMatch = str.replace(/\s+/g, ' ').toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
              const hhmmMatch = str.replace(/\s+/g, ' ').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
              if (ampmMatch) {
                let hours = parseInt(ampmMatch[1], 10);
                const minutes = ampmMatch[2];
                const period = ampmMatch[3];
                if (period === 'PM' && hours < 12) hours += 12;
                else if (period === 'AM' && hours === 12) hours = 0;
                clone[field] = `${String(hours).padStart(2, '0')}:${minutes}:00`;
              } else if (hhmmMatch) {
                const hours = parseInt(hhmmMatch[1], 10);
                const minutes = hhmmMatch[2];
                const seconds = hhmmMatch[3] || '00';
                clone[field] = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
              } else {
                clone[field] = null;
              }
            } catch (e) {
              clone[field] = null;
            }
          }
        }
      }
    }

    // Double check NOT NULL for leads just in case it got nulled
    if (table === 'leads') {
      if (clone.event_date === null) clone.event_date = new Date().toISOString().split('T')[0];
      if (clone.event_time === null) clone.event_time = '12:00:00';
    }

    return clone;
  };

  // Synchronous CRUD wrappers for updating Supabase in backgrounds
const safeParseResponse = async (response: Response): Promise<{ ok: boolean; data: any; isJson: boolean; text: string }> => {
  try {
    const text = await response.text();
    if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
      return { ok: false, data: null, isJson: false, text };
    }
    const data = JSON.parse(text);
    return { ok: response.ok, data, isJson: true, text };
  } catch (err) {
    return { ok: false, data: null, isJson: false, text: '' };
  }
};

  const pushInsert = async (table: string, record: any): Promise<{ success: boolean; error?: string; localFallback?: boolean }> => {
    if (!supabaseClient) return { success: true };
    try {
      let sanitized: any;
      if (Array.isArray(record)) {
        if (record.length === 0) return { success: true };
        sanitized = record.map((recItem) => {
          const itemCopy = { ...recItem };
          if (table === 'leads') {
            if (!('total_pax' in itemCopy)) itemCopy.total_pax = 0;
            if (!('reference_source' in itemCopy)) itemCopy.reference_source = '';
            const anyStatus = itemCopy.status || itemCopy.current_status || 'New Lead';
            itemCopy.status = anyStatus;
            itemCopy.current_status = anyStatus;
            if (currentUserName) {
              itemCopy.created_by = `${currentUserName}|${currentRole || 'System'}`;
            }
          }
          const san = sanitizeTimeFieldsForDb(stripClientOnlyFields(table, itemCopy), table);
          if (table === 'operations_staff' && san.staff_id) {
            san.staff_id = mapToDbStaffId(san.staff_id);
          }
          if (table === 'equipment' && san.equipment_id) {
            san.equipment_id = mapToDbEquipmentId(san.equipment_id);
          }
          if (table === 'raw_footage') {
            if (!san.tracking_id) san.tracking_id = `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
            if (!san.event_completed_date) san.event_completed_date = new Date().toISOString().split('T')[0];
            if (san.raw_received === undefined) san.raw_received = san.status === 'Received' || !!san.server_path;
            if (!san.status) san.status = san.raw_received ? 'Received' : 'Pending';
          }
          if (table === 'equipment_handovers') {
            if (!san.handover_id) san.handover_id = `HND-${Math.floor(1000 + Math.random() * 9000)}`;
            if (!san.created_at) san.created_at = new Date().toISOString();
            if (!san.return_date) san.return_date = new Date().toISOString().split('T')[0];
          }
          if (table === 'payment_history') {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!san.id || !uuidRegex.test(san.id)) {
              san.id = generateUUID();
            }
          }
          return san;
        });
      } else {
        if (table === 'leads') {
          if (!('total_pax' in record)) {
            record.total_pax = 0;
          }
          if (!('reference_source' in record)) {
            record.reference_source = '';
          }
        }
        sanitized = sanitizeTimeFieldsForDb(stripClientOnlyFields(table, record), table);
        if (table === 'payment_history') {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!sanitized.id || !uuidRegex.test(sanitized.id)) {
            sanitized.id = generateUUID();
          }
        }
        if (table === 'operations_staff' && sanitized.staff_id) {
          sanitized.staff_id = mapToDbStaffId(sanitized.staff_id);
        }
        if (table === 'equipment' && sanitized.equipment_id) {
          sanitized.equipment_id = mapToDbEquipmentId(sanitized.equipment_id);
        }
        if (table === 'raw_footage') {
          if (!sanitized.tracking_id) sanitized.tracking_id = `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
          if (!sanitized.event_completed_date) sanitized.event_completed_date = new Date().toISOString().split('T')[0];
          if (sanitized.raw_received === undefined) sanitized.raw_received = sanitized.status === 'Received' || !!sanitized.server_path;
          if (!sanitized.status) sanitized.status = sanitized.raw_received ? 'Received' : 'Pending';
        }
        if (table === 'equipment_handovers') {
          if (!sanitized.handover_id) sanitized.handover_id = `HND-${Math.floor(1000 + Math.random() * 9000)}`;
          if (!sanitized.created_at) sanitized.created_at = new Date().toISOString();
          if (!sanitized.return_date) sanitized.return_date = new Date().toISOString().split('T')[0];
        }
        if (table === 'leads') {
          const anyStatus = sanitized.status || sanitized.current_status || record.status || record.current_status || 'New Lead';
          sanitized.status = anyStatus;
          sanitized.current_status = anyStatus;
          if (currentUserName) {
            sanitized.created_by = `${currentUserName}|${currentRole || 'System'}`;
          }
        }
      }
      // Try sending to server-side proxy first to bypass client RLS issues
      try {
        const response = await fetch('/api/db/insert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, record: sanitized })
        });
        const parsed = await safeParseResponse(response);
        if (parsed.isJson && parsed.data && typeof parsed.data === 'object') {
          const resJson = parsed.data;
          if (resJson && resJson.success) {
            console.log(`[pushInsert Proxy SUCCESS] for ${table}:`, resJson.data);
            updateDiagnosticMetric('insert', 'ok');

            // Clean up matching local record if any from erp_local_<tableKey>
            const localKey = `erp_local_${table}`;
            const existingLocalStr = localStorage.getItem(localKey);
            if (existingLocalStr) {
              try {
                const localRecords = JSON.parse(existingLocalStr);
                if (Array.isArray(localRecords)) {
                  const idCol = table === 'leads' ? 'lead_id' : (table === 'orders' ? 'order_id' : null);
                  if (idCol) {
                    const recIds = Array.isArray(record) ? record.map(r => r[idCol]).filter(Boolean) : [record[idCol]].filter(Boolean);
                    if (recIds.length > 0) {
                      const filtered = localRecords.filter((r: any) => r && !recIds.includes(r[idCol]));
                      localStorage.setItem(localKey, JSON.stringify(filtered));
                    }
                  }
                }
              } catch (e) {
                console.error(`Error cleaning up local records on insert for ${table}:`, e);
              }
            }

            broadcastSyncPing();
            return { success: true };
          } else {
            console.warn(`[pushInsert Proxy WARN] server returned success=false for ${table}`, resJson?.error);
            return { success: false, error: resJson?.error || "Server validation failed" };
          }
        } else {
          console.warn(`[pushInsert Proxy WARN] server returned non-JSON or status ${response.status} for ${table}, falling back...`);
        }
      } catch (proxyErr) {
        console.warn(`[pushInsert Proxy ERROR] failed to reach server for ${table}, falling back...`, proxyErr);
      }

      try {
        let { data: fallbackInsData, error } = await supabaseClient.from(table).insert(sanitized).select();
        if (error && table === 'lead_events' && (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('lead_events_pkey'))) {
          try {
            const { data: allEvs } = await supabaseClient.from('lead_events').select('id');
            let maxId = 0;
            if (Array.isArray(allEvs)) {
              for (const row of allEvs) {
                const num = typeof row.id === 'number' ? row.id : parseInt(String(row.id), 10);
                if (!isNaN(num) && num > maxId) maxId = num;
              }
            }
            const retryPayload = { ...sanitized, id: maxId + 1 };
            const retryRes = await supabaseClient.from('lead_events').insert(retryPayload).select();
            if (!retryRes.error) {
              fallbackInsData = retryRes.data;
              error = null;
            }
          } catch (retryE) {
            console.warn("[lead_events fallback retry exception]:", retryE);
          }
        }
        if (error) {
          if (['activity_logs', 'notifications', 'analytics_snapshots'].includes(table)) {
            return { success: true };
          }
          console.error(`[Server DB insert Error] ${table}:`, error?.message || String(error));
          updateDiagnosticMetric('insert', 'fail', error?.message || String(error));
          return { success: false, error: `[Table: ${table}] ${error?.message || String(error)}` };
        } else {
          updateDiagnosticMetric('insert', 'ok');

          // Clean up matching local record if any from erp_local_<tableKey>
          const localKey = `erp_local_${table}`;
          const existingLocalStr = localStorage.getItem(localKey);
          if (existingLocalStr) {
            try {
              const localRecords = JSON.parse(existingLocalStr);
              if (Array.isArray(localRecords)) {
                const idCol = table === 'leads' ? 'lead_id' : (table === 'orders' ? 'order_id' : null);
                if (idCol) {
                  const recIds = Array.isArray(record) ? record.map(r => r[idCol]).filter(Boolean) : [record[idCol]].filter(Boolean);
                  if (recIds.length > 0) {
                    const filtered = localRecords.filter((r: any) => r && !recIds.includes(r[idCol]));
                    localStorage.setItem(localKey, JSON.stringify(filtered));
                  }
                }
              }
            } catch (e) {
              console.error(`Error cleaning up local records on insert for ${table}:`, e);
            }
          }

          // Realtime subscription will handle syncing new records
          broadcastSyncPing();

          return { success: true };
        }
      } catch (sbErr: any) {
        console.warn(`Supabase insert exception in ${table} (handled gracefully):`, sbErr?.message || String(sbErr));
        return { success: true, localFallback: true };
      }
    } catch (err: any) {
      console.warn(`Supabase Insert exception in ${table}:`, err?.message || String(err));
      updateDiagnosticMetric('insert', 'fail', err?.message || String(err));
      return { success: false, error: err?.message || String(err) };
    }
  };

  const pushUpdate = async (table: string, matchColumn: string, matchValue: any, updates: any): Promise<{ success: boolean; error?: string; localFallback?: boolean }> => {
    if (!supabaseClient) return { success: true };
    try {
      const sanitized = sanitizeTimeFieldsForDb(stripClientOnlyFields(table, updates), table);
      let finalMatchValue = matchValue;
      if (table === 'payment_history') {
        if (matchColumn === 'payment_history_id') {
          matchColumn = 'id';
        }
      }
      if (table === 'operations_staff') {
        if (matchColumn === 'staff_id' && matchValue) {
          finalMatchValue = mapToDbStaffId(matchValue);
        }
        if (sanitized.staff_id) {
          sanitized.staff_id = mapToDbStaffId(sanitized.staff_id);
        }
      }
      // Enforce permanent lock on staff mobile number and email after creation
      if (table === 'operations_staff' || table === 'production_staff' || table === 'staff') {
        delete sanitized.mobile;
        delete sanitized.phone;
        delete sanitized.mobile_number;
        delete sanitized.email;
      }
      if (table === 'equipment') {
        if (matchColumn === 'equipment_id' && matchValue) {
          finalMatchValue = mapToDbEquipmentId(matchValue);
        }
        if (sanitized.equipment_id) {
          sanitized.equipment_id = mapToDbEquipmentId(sanitized.equipment_id);
        }
      }
      if (table === 'leads') {
        const leadId = matchColumn === 'lead_id' ? matchValue : null;
        const prevLead = leads.find(l => l.lead_id === leadId);
        if (!('total_pax' in sanitized)) {
          sanitized.total_pax = prevLead ? (prevLead.total_pax ?? 0) : 0;
        }
        if (!('reference_source' in sanitized)) {
          sanitized.reference_source = prevLead ? (prevLead.reference_source ?? '') : '';
        }
      }
      console.log(`[pushUpdate START] table: ${table}, match: ${matchColumn}=${matchValue}`, sanitized);

      // --- CONSTRAINT BYPASS LOGIC ---
      if (table === 'leads') {
        const anyStatus = sanitized.status || sanitized.current_status || updates.status || updates.current_status;
        if (anyStatus) {
          sanitized.status = anyStatus;
          sanitized.current_status = anyStatus;
        }
        if (currentUserName) {
          sanitized.updated_by = `${currentUserName}|${currentRole || 'System'}`;
        }
      } else if (table === 'orders') {
        if (sanitized.current_stage) {
          sanitized.order_status = ['Closed', 'Delivered', 'Paid'].includes(sanitized.current_stage) ? sanitized.current_stage : 'Confirmed';
        }
      }
      // -------------------------------
      
      if (Object.keys(sanitized).length === 0) {
        console.log(`[pushUpdate SKIPPED] No valid columns to update for ${table}.`);
        return { success: true };
      }

      console.log(`[pushUpdate EXECUTING] on ${table}:`, sanitized);
      
      // Try sending to server-side proxy first to bypass client RLS issues
      try {
        const response = await fetch('/api/db/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, matchColumn, matchValue: finalMatchValue, updates: sanitized })
        });
        const parsed = await safeParseResponse(response);
        if (parsed.isJson && parsed.data && typeof parsed.data === 'object') {
          const resJson = parsed.data;
          if (resJson && resJson.success) {
            console.log(`[pushUpdate Proxy SUCCESS] for ${table}:`, resJson.data);
            updateDiagnosticMetric('update', 'ok');
            if (table === 'operations') {
              setOperations(prev => {
                let found = false;
                const updated = prev.map(op => {
                  if (op.order_id === finalMatchValue || op.operation_id === finalMatchValue) {
                    found = true;
                    return { ...op, ...sanitized };
                  }
                  return op;
                });
                if (!found && matchColumn === 'order_id') {
                  return [...updated, {
                    operation_id: `OP-${finalMatchValue}`,
                    order_id: finalMatchValue,
                    photographer_assigned: 'Unassigned',
                    videographer_assigned: 'Unassigned',
                    drone_operator_assigned: 'Unassigned',
                    assistant_assigned: 'Unassigned',
                    equipment_kit: '',
                    reporting_time: '08:00',
                    event_status: 'Completed',
                    updated_by: currentUserName || 'System',
                    ...sanitized
                  }];
                }
                return updated;
              });
            }
            if (table === 'editor_assignments') {
              const linkVal = sanitized.Edited_Drive_Link || sanitized.edited_drive_link || updates.Edited_Drive_Link || updates.edited_drive_link;
              setEditorAssignments(prev => {
                const updated = prev.map(a => a.assignment_id === finalMatchValue ? {
                  ...a,
                  ...updates,
                  ...sanitized,
                  Edited_Drive_Link: linkVal || a.Edited_Drive_Link,
                  edited_drive_link: linkVal || a.edited_drive_link
                } : a);
                try {
                  localStorage.setItem('erp_editor_assignments', JSON.stringify(updated));
                } catch (_) {}
                return updated;
              });
            }
            if (table === 'staff_assignments') {
              setStaffAssignments(prev => {
                const updated = prev.map(a => (matchColumn === 'assignment_id' ? a.assignment_id === finalMatchValue : (matchColumn === 'order_id' ? a.order_id === finalMatchValue : false)) ? {
                  ...a,
                  ...updates,
                  ...sanitized
                } : a);
                try {
                  localStorage.setItem('erp_staff_assignments', JSON.stringify(updated));
                } catch (_) {}
                return updated;
              });
            }
            if (table === 'raw_footage') {
              setRawFootage(prev => {
                const updated = prev.map(rf => (matchColumn === 'tracking_id' ? rf.tracking_id === finalMatchValue : (matchColumn === 'order_id' ? rf.order_id === finalMatchValue : false)) ? {
                  ...rf,
                  ...updates,
                  ...sanitized
                } : rf);
                try {
                  localStorage.setItem('erp_raw_footage', JSON.stringify(updated));
                } catch (_) {}
                return updated;
              });
            }
            if (table === 'orders') {
              setOrders(prev => {
                const updated = prev.map(o => (matchColumn === 'order_id' ? o.order_id === finalMatchValue : false) ? {
                  ...o,
                  ...updates,
                  ...sanitized
                } : o);
                try {
                  localStorage.setItem('erp_orders', JSON.stringify(updated));
                } catch (_) {}
                return updated;
              });
            }
            if (table === 'leads') {
              const leadId = finalMatchValue;
              const prevLead = leads.find(l => l.lead_id === leadId);
              const oldStatus = prevLead ? (prevLead.current_status || prevLead.status || 'New Lead') : 'New Lead';
              const anyStatus = sanitized.status || sanitized.current_status || updates.status || updates.current_status;
              
              setLeads(prev => {
                const updated = prev.map(l => (matchColumn === 'lead_id' ? l.lead_id === finalMatchValue : false) ? {
                  ...l,
                  ...updates,
                  ...sanitized,
                  ...(anyStatus ? { status: anyStatus, current_status: anyStatus } : {})
                } : l);
                try {
                  localStorage.setItem('erp_leads', JSON.stringify(updated));
                } catch (_) {}
                return updated;
              });

              if (anyStatus && anyStatus !== oldStatus) {
                const timestamp = new Date().toISOString();
                const linkedOrder = orders.find(o => o.lead_id === leadId);
                const orderId = linkedOrder ? linkedOrder.order_id : null;
                const authorString = currentUserName ? `${currentUserName}|${currentRole || 'System'}` : 'System';
                
                const historyPayload = {
                  history_id: `HST-${Math.floor(1000 + Math.random() * 9000)}`,
                  lead_id: leadId,
                  order_id: orderId,
                  old_status: oldStatus,
                  new_status: anyStatus,
                  changed_by: authorString,
                  remarks: sanitized.remarks || updates.remarks || ''
                };
                
                pushInsert('lead_status_history', historyPayload).catch(e => console.warn("Failed to insert status history:", e));
              }
            }

            broadcastSyncPing();
            return { success: true };
          } else {
            console.warn(`[pushUpdate Proxy WARN] server returned success=false for ${table}`, resJson?.error);
            return { success: false, error: resJson?.error || "Server validation failed" };
          }
        } else {
          console.warn(`[pushUpdate Proxy WARN] server returned non-JSON or status ${response.status} for ${table}, falling back...`);
        }
      } catch (proxyErr: any) {
        console.warn(`[pushUpdate Proxy ERROR] failed to reach server for ${table}, falling back...`, proxyErr);
      }

      try {
        let { error, data } = await supabaseClient.from(table).update(sanitized).eq(matchColumn, finalMatchValue).select();
        
        // Automatic unified fallback for missing column errors, database check constraints or value exceptions
        if (error && (
          error.message.toLowerCase().includes('could not find the') ||
          error.message.toLowerCase().includes('schema cache') ||
          error.message.toLowerCase().includes('column')
        )) {
          const p1 = error.message.match(/Could not find the ['"]([^'"]+)['"] column/i);
          const p2 = error.message.match(/column ['"]([^'"]+)['"] (of relation|does not exist)/i);
          const p3 = error.message.match(/column ['"]([^'"]+)['"]/i);
          
          let colName = p1?.[1] || p2?.[1] || (p3?.[1] && !['of', 'in', 'on', 'from'].includes(p3[1].toLowerCase()) ? p3[1] : null);
          if (colName && colName in sanitized) {
            console.warn(`[pushUpdate FALLBACK] Stripping non-existent column "${colName}" from ${table} update and retrying...`);
            delete sanitized[colName];
            const retryRes = await supabaseClient.from(table).update(sanitized).eq(matchColumn, finalMatchValue).select();
            error = retryRes.error;
            data = retryRes.data;
          }
        }

        if (error && (
          error.message.toLowerCase().includes('constraint') || 
          error.message.toLowerCase().includes('check') || 
          error.message.toLowerCase().includes('violate') || 
          error.message.toLowerCase().includes('status_check') ||
          error.message.toLowerCase().includes('invalid')
        )) {
           let fallbackNeeded = false;
           if (table === 'leads' && sanitized.status) {
              console.warn(`[pushUpdate FALLBACK] Constraint error on leads for status (${sanitized.status}). Stripping status and retrying with current_status only...`);
              delete sanitized.status;
              fallbackNeeded = true;
           }
           if (table === 'orders' && sanitized.order_status) {
              console.warn(`[pushUpdate FALLBACK] Constraint error on orders for stage (${sanitized.current_stage}). Stripping order_status and retrying...`);
              delete sanitized.order_status;
              fallbackNeeded = true;
           }
           if (table === 'production' && sanitized.editing_status) {
              console.warn(`[pushUpdate FALLBACK] Constraint error on production for status (${sanitized.editing_status}). Stripping editing_status and retrying...`);
              delete sanitized.editing_status;
              fallbackNeeded = true;
           }
           if (fallbackNeeded) {
              const fallback = await supabaseClient.from(table).update(sanitized).eq(matchColumn, matchValue).select();
              error = fallback.error;
              data = fallback.data;
           }
        }
        if (error) {
          if (['activity_logs', 'notifications', 'analytics_snapshots'].includes(table)) {
            return { success: true };
          }
          console.error(`[Server DB update Error] ${table}:`, error?.message || String(error));
          updateDiagnosticMetric('update', 'fail', error?.message || String(error));
          return { success: false, error: `[Table: ${table}] ${error?.message || String(error)}` };
        } else {
          console.log(`[pushUpdate SUCCESS] returned data:`, data);
          updateDiagnosticMetric('update', 'ok');
          if (table === 'leads') {
            const leadId = matchValue;
            const prevLead = leads.find(l => l.lead_id === leadId);
            const oldStatus = prevLead ? (prevLead.current_status || prevLead.status || 'New Lead') : 'New Lead';
            const anyStatus = sanitized.status || sanitized.current_status || updates.status || updates.current_status;
            
            if (anyStatus && anyStatus !== oldStatus) {
              const timestamp = new Date().toISOString();
              const linkedOrder = orders.find(o => o.lead_id === leadId);
              const orderId = linkedOrder?.order_id || null;
              
              const roleParts = (currentUserName && currentUserName.includes('|')) 
                ? currentUserName.split('|') 
                : [currentUserName || 'System', currentRole || 'System'];
              const changedBy = roleParts[0];
              const changedByRole = roleParts[1] || currentRole || 'System';
              
              const newHist = {
                lead_id: leadId,
                order_id: orderId,
                old_status: oldStatus,
                new_status: anyStatus,
                changed_by: changedBy,
                changed_by_role: changedByRole,
                remarks: updates.remarks || sanitized.remarks || 'Status updated from dashboard',
                created_at: timestamp
              };
              
              try {
                const insertRes = await supabaseClient.from('lead_status_history').insert(newHist);
                if (insertRes.error) {
                  console.warn("Failed to insert lead status history in pushUpdate:", insertRes.error?.message || insertRes.error);
                } else {
                  setStatusHistory(prev => {
                    const updatedHist = [...prev, newHist];
                    localStorage.setItem('erp_status_history', JSON.stringify(updatedHist));
                    return updatedHist;
                  });
                }
              } catch (e: any) {
                console.warn("Failed to insert lead status history in pushUpdate (exception):", e?.message || e);
              }
              
              setLeads((prev) => 
                prev.map((ld) => {
                  if (ld.lead_id === leadId) {
                    return {
                      ...ld,
                      status: anyStatus,
                      current_status: anyStatus,
                      updated_at: timestamp
                    };
                  }
                  return ld;
                })
              );
            }
          }

          if (table === 'editor_assignments') {
            const linkVal = sanitized.Edited_Drive_Link || sanitized.edited_drive_link || updates.Edited_Drive_Link || updates.edited_drive_link;
            setEditorAssignments(prev => {
              const updated = prev.map(a => a.assignment_id === matchValue ? {
                ...a,
                ...updates,
                ...sanitized,
                Edited_Drive_Link: linkVal || a.Edited_Drive_Link,
                edited_drive_link: linkVal || a.edited_drive_link
              } : a);
              try {
                localStorage.setItem('erp_editor_assignments', JSON.stringify(updated));
              } catch (_) {}
              return updated;
            });
          }

          // Clean up from erp_local_<tableKey> upon successful db write
          const localKey = `erp_local_${table}`;
          const existingLocalStr = localStorage.getItem(localKey);
          if (existingLocalStr) {
            try {
              const localRecords = JSON.parse(existingLocalStr);
              if (Array.isArray(localRecords)) {
                const filtered = localRecords.filter((r: any) => r && r[matchColumn] !== matchValue);
                localStorage.setItem(localKey, JSON.stringify(filtered));
              }
            } catch (e) {
              console.error(`Error cleaning up local records for ${table}:`, e);
            }
          }

          // Realtime subscription will handle syncing updated records
          broadcastSyncPing();

          return { success: true };
        }
      } catch (sbErr: any) {
        console.warn(`Supabase update exception in ${table} (handled gracefully):`, sbErr?.message || String(sbErr));
        return { success: true, localFallback: true };
      }
    } catch (err: any) {
      console.warn(`[pushUpdate EXCEPTION] in ${table}:`, err?.message || String(err));
      updateDiagnosticMetric('update', 'fail', err?.message || String(err));
      return { success: false, error: err?.message || String(err) };
    }
  };

  const pushDelete = async (table: string, matchColumn: string, matchValue: any): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseClient) return { success: true };
    try {
      let finalMatchValue = matchValue;
      if (table === 'operations_staff' && matchColumn === 'staff_id' && matchValue) {
        finalMatchValue = mapToDbStaffId(matchValue);
      }
      if (table === 'equipment' && matchColumn === 'equipment_id' && matchValue) {
        finalMatchValue = mapToDbEquipmentId(matchValue);
      }
      // Remove from local fallback store
      const localKey = `erp_local_${table}`;
      const existingLocalStr = localStorage.getItem(localKey);
      if (existingLocalStr) {
        try {
          const localRecords = JSON.parse(existingLocalStr);
          const filtered = localRecords.filter((r: any) => r && r[matchColumn] !== matchValue);
          localStorage.setItem(localKey, JSON.stringify(filtered));
        } catch (e) {}
      }

      // Try sending to server-side proxy first to bypass client RLS issues
      try {
        const response = await fetch('/api/db/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, matchColumn, matchValue: finalMatchValue })
        });
        const parsed = await safeParseResponse(response);
        if (parsed.ok && parsed.isJson) {
          const resJson = parsed.data;
          if (resJson && resJson.success) {
            console.log(`[pushDelete Proxy SUCCESS] for ${table}`);
            updateDiagnosticMetric('delete', 'ok');
            broadcastSyncPing();
            return { success: true };
          } else {
            console.warn(`[pushDelete Proxy WARN] server returned success=false for ${table}, falling back...`, resJson?.error);
          }
        } else {
          console.warn(`[pushDelete Proxy WARN] server returned non-JSON or status ${response.status} for ${table}, falling back...`);
        }
      } catch (proxyErr) {
        console.warn(`[pushDelete Proxy ERROR] failed to reach server for ${table}, falling back...`, proxyErr);
      }

      try {
        const { data: fallbackDelData, error } = await supabaseClient.from(table).delete().eq(matchColumn, finalMatchValue).select();
        if (error) {
          if (['activity_logs', 'notifications', 'analytics_snapshots'].includes(table)) {
            return { success: true };
          }
          console.warn(`Supabase Delete error in ${table}:`, error?.message || String(error));
          updateDiagnosticMetric('delete', 'fail', error?.message || String(error));
          return { success: false, error: `[Table: ${table}] ${error?.message || String(error)}` };
        } else {
          updateDiagnosticMetric('delete', 'ok');
          // Realtime subscription will handle syncing deleted records
          broadcastSyncPing();
          return { success: true };
        }
      } catch (sbErr: any) {
        console.warn(`Supabase delete exception in ${table} (handled gracefully):`, sbErr?.message || String(sbErr));
        return { success: true };
      }
    } catch (err: any) {
      updateDiagnosticMetric('delete', 'fail', err?.message || String(err));
      return { success: false, error: err?.message || String(err) };
    }
  };

  const pushUpsert = async (table: string, record: any) => {
    if (!supabaseClient) return { success: true };
    try {
      const sanitized = stripClientOnlyFields(table, record);
      
      // Try proxy first
      try {
        const response = await fetch('/api/db/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, record: sanitized })
        });
        const parsed = await safeParseResponse(response);
        if (parsed.isJson && parsed.data && typeof parsed.data === 'object') {
          const resJson = parsed.data;
          if (resJson && resJson.success) {
            updateDiagnosticMetric('insert', 'ok');
            broadcastSyncPing();
            return { success: true, data: resJson.data };
          } else {
            console.warn(`[pushUpsert Proxy WARN] server returned success=false for ${table}`, resJson?.error);
            return { success: false, error: resJson?.error || "Server validation failed" };
          }
        }
      } catch (proxyErr) {
        console.warn(`[pushUpsert Proxy ERROR] failed to reach server for ${table}, falling back...`, proxyErr);
      }

      try {
        const { error } = await supabaseClient.from(table).upsert(sanitized);
        if (error) {
          console.warn(`Supabase Upsert error in ${table}:`, error?.message || String(error));
          updateDiagnosticMetric('insert', 'fail', error?.message || String(error));
          return { success: false, error: `[Table: ${table}] ${error?.message || String(error)}` };
        } else {
          updateDiagnosticMetric('insert', 'ok');
          // Realtime subscription will handle syncing
          broadcastSyncPing();
          return { success: true };
        }
      } catch (sbErr: any) {
        console.warn(`Supabase upsert exception in ${table} (handled gracefully):`, sbErr?.message || String(sbErr));
        return { success: true };
      }
    } catch (err: any) {
      updateDiagnosticMetric('insert', 'fail', err?.message || String(err));
      return { success: false, error: err?.message || String(err) };
    }
  };

  // Fetch full dataset from Supabase
  const seedDatabase = async () => {
    if (!supabaseClient) return;
    try {
      console.log('Database is empty, starting automated initial seeding to Supabase...');
      for (const u of INITIAL_USERS) {
        await supabaseClient.from('users').upsert({
          ...u,
          id: mapToDbUserId(u.id),
          username: u.username || u.email.split('@')[0]
        });
      }
      // Upsert other tables
      if (INITIAL_LEADS?.length > 0) await supabaseClient.from('leads').upsert(INITIAL_LEADS);
      if (INITIAL_ORDERS?.length > 0) await supabaseClient.from('orders').upsert(INITIAL_ORDERS);
      if (INITIAL_OPERATIONS?.length > 0) await supabaseClient.from('operations').upsert(INITIAL_OPERATIONS);
      if (INITIAL_RAW_FOOTAGE?.length > 0) await supabaseClient.from('raw_footage').upsert(INITIAL_RAW_FOOTAGE);
      if (INITIAL_PRODUCTION?.length > 0) await supabaseClient.from('production').upsert(INITIAL_PRODUCTION);
      if (INITIAL_PAYMENTS?.length > 0) await supabaseClient.from('payments').upsert(INITIAL_PAYMENTS);
      try { if (INITIAL_LOGS?.length > 0) await supabaseClient.from('activity_logs').upsert(INITIAL_LOGS); } catch (e) {}
      try {
        if (INITIAL_PACKAGES?.length > 0) {
          for (const pkg of INITIAL_PACKAGES) {
            await pushUpsert('packages', mapPackageToDbPayload(pkg));
          }
        }
      } catch (e) {
        console.warn('Initial package seeding warning:', e);
      }

      console.log('Database initial seeding completed successfully.');
    } catch (err: any) {
      console.error('Automated database seeding failed:', err);
    }
  };

  // Fetch full dataset from Supabase
  const fetchFromDb = async (showLoader = false) => {
    if (!supabaseClient) return;

    if (showLoader) setIsDataLoading(true);

    if (activeFetchPromiseRef.current) {
      return activeFetchPromiseRef.current;
    }

    const fetchPromise = (async () => {
      isFetchingRef.current = true;
      lastFetchTimeRef.current = Date.now();
      try {
        let runAgain = true;
        while (runAgain) {
          fetchPendingRef.current = false;

          let results: any[];
          try {
            const proxyRes = await fetch('/api/db/select-all', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const parsed = await safeParseResponse(proxyRes);
            if (parsed.ok && parsed.isJson && parsed.data && parsed.data.success) {
              const serverDataList = parsed.data.data;
              const serverErrorsList = parsed.data.errors;
              results = serverDataList.map((data: any, idx: number) => ({
                data,
                error: serverErrorsList[idx] ? { message: serverErrorsList[idx] } : null
              }));
            } else {
              throw new Error(parsed.data?.error || 'Proxy select-all returned non-success response');
            }
          } catch (e) {
            console.warn('[RoleContext] select-all proxy failed, falling back to individual fetches:', e);
            results = await Promise.all([
              supabaseClient.from('users').select('*'),
              supabaseClient.from('leads').select('*').order('created_at', { ascending: false }),
              supabaseClient.from('orders').select('*').order('created_at', { ascending: false }),
              supabaseClient.from('operations').select('*'),
              supabaseClient.from('raw_footage').select('*'),
              supabaseClient.from('production').select('*'),
              supabaseClient.from('payments').select('*'),
              supabaseClient.from('activity_logs').select('*').order('timestamp', { ascending: false }),
              supabaseClient.from('operations_staff').select('*').order('name'),
              supabaseClient.from('notifications').select('*').order('created_at', { ascending: false }),
              supabaseClient.from('equipment').select('*').order('created_at', { ascending: false }),
              supabaseClient.from('lead_packages').select('*'),
              supabaseClient.from('packages').select('*').order('created_at', { ascending: false }),
              supabaseClient.from('staff_assignments').select('*'),
              supabaseClient.from('quotations').select('*'),
              supabaseClient.from('lead_status_history').select('*').order('created_at', { ascending: true }),
              supabaseClient.from('lead_staff_assignment_history').select('*').order('assigned_at', { ascending: false }),
              supabaseClient.from('lead_equipment_history').select('*').order('returned_at', { ascending: false }),
              supabaseClient.from('lead_events').select('*').order('created_at', { ascending: true }),
              Promise.resolve({ data: [], error: null }),
              supabaseClient.from('production_specialties').select('*'),
              supabaseClient.from('editor_assignments').select('*'),
              supabaseClient.from('production_staff').select('*'),
              supabaseClient.from('calendar_memos').select('*').order('created_at', { ascending: false }),
              supabaseClient.from('payment_history').select('*')
            ]);
          }

        const tables = [
          'users', 'leads', 'orders', 'operations', 'raw_footage', 'production', 
          'payments', 'activity_logs', 'operations_staff', 'notifications', 
          'equipment', 'lead_packages', 'packages', 'staff_assignments', 
          'quotations', 'lead_status_history', 'lead_staff_assignment_history', 
          'lead_equipment_history', 'lead_events', 'equipment_handovers', 
          'production_specialties', 'editor_assignments', 'production_staff', 'calendar_memos', 'payment_history'
        ];
        
        for (let i = 0; i < (results || []).length; i++) {
          if (results[i]?.error) {
             console.warn(`Data Fetch Warning in table ${tables[i] || i}:`, results[i].error);
             if (tables[i] === 'leads' && results[i].error.message?.includes('created_at')) {
               const fallbackRes = await supabaseClient.from('leads').select('*');
               results[i] = fallbackRes;
             }
             if (tables[i] === 'orders' && results[i].error.message?.includes('created_at')) {
               const fallbackRes = await supabaseClient.from('orders').select('*');
               results[i] = fallbackRes;
             }
          }
        }

        const safeResults = (results || []).map(r => r || { data: [] });
        const [
          { data: dbUsers } = { data: [] },
          { data: dbLeads } = { data: [] },
          { data: dbOrders } = { data: [] },
          { data: dbOperations } = { data: [] },
          { data: dbRawFootage } = { data: [] },
          { data: dbProduction } = { data: [] },
          { data: dbPayments } = { data: [] },
          { data: dbLogs } = { data: [] },
          { data: dbStaff } = { data: [] },
          { data: dbNotifications } = { data: [] },
          { data: dbEquipment } = { data: [] },
          { data: dbLeadPackages } = { data: [] },
          { data: dbPackages } = { data: [] },
          { data: dbStaffAssignments } = { data: [] },
          { data: dbQuotations } = { data: [] },
          { data: dbStatusHistory } = { data: [] },
          { data: dbLeadStaffAssignmentHistory } = { data: [] },
          { data: dbLeadEquipmentHistory } = { data: [] },
          { data: dbLeadEvents } = { data: [] },
          { data: dbHandovers } = { data: [] },
          { data: dbSpecList } = { data: [] },
          { data: dbAssignList } = { data: [] },
          { data: dbProdStaff } = { data: [] },
          { data: dbCalendarMemos } = { data: [] },
          { data: dbPaymentHistory } = { data: [] }
        ] = safeResults;

        if (dbUsers && dbUsers.length === 0) {
          await seedDatabase();
          fetchPendingRef.current = true;
          break;
        }
        if (dbUsers) {
          setUsers(dbUsers.map(mapUserFieldsFromDb));
        }

        if (dbLeads) {
          const parsedLeads = dbLeads.map((l: any) => {
            let evts = [];
            if (dbLeadEvents) {
              evts = dbLeadEvents
                .filter((e: any) => e.lead_id === l.lead_id)
                .map((e: any) => ({
                  ...e,
                  event_start_date: e.event_start_date || e.event_date || '',
                  event_end_date: e.event_end_date || e.Event_End_Date || l.Event_End_Date || '',
                  event_start_time: e.event_start_time || '',
                  event_end_time: e.event_end_time || '',
                  reporting_date: e.reporting_date || e.Reporting_date || '',
                  Reporting_date: e.Reporting_date || e.reporting_date || '',
                  reporting_time: e.reporting_time || ''
                }));
            }
            if (evts.length === 0 && l.events && Array.isArray(l.events) && l.events.length > 0) {
              evts = l.events;
            }
            const deserializedFromNotes = l.notes_special_customizations ? deserializeLeadEvents(l.notes_special_customizations).events : [];
            if (evts.length === 0 && deserializedFromNotes && deserializedFromNotes.length > 0) {
              evts = deserializedFromNotes;
            }

            // Ensure each event in evts has its event-specific deliverables and team members
            evts = evts.map((e: any, idx: number) => {
              const eId = e.id || e.event_id || `EVT-0${idx + 1}`;
              const eName = e.event_name || e.custom_event_name || e.event_type || `Event ${idx + 1}`;

              let eventDeliverables = e.deliverables;
              if ((!eventDeliverables || (Array.isArray(eventDeliverables) && eventDeliverables.length === 0)) && l.deliverables_description) {
                const parsed = parseDeliverablesWithQty(l.deliverables_description, eName, eId, idx);
                if (parsed.length > 0) {
                  eventDeliverables = parsed;
                }
              }

              let eventTeamMembers = e.team_members || e.Team_Members;
              if ((!eventTeamMembers || (Array.isArray(eventTeamMembers) && eventTeamMembers.length === 0)) && (l.team_members || l.Team_member || l.Team_Members)) {
                const rawTm = l.team_members || l.Team_member || l.Team_Members;
                const parsedTm = parseTeamMembers(rawTm, eName, eId, idx);
                if (parsedTm.length > 0) {
                  eventTeamMembers = parsedTm;
                }
              }

              return {
                ...e,
                id: eId,
                event_id: eId,
                event_name: eName,
                deliverables: eventDeliverables || [],
                team_members: eventTeamMembers || []
              };
            });

            let finalStatus = l.current_status || l.status || 'New Lead';
            if (finalStatus === 'Follow-up' || finalStatus === 'Follow-Up') {
              finalStatus = 'Follow Up';
            }
            const teamData = l.Team_member || l.Team_Members || l.team_members || l.Team_members || l.team_member || '';
            const finalQuoteAmt = l.Final_Quotation_Amount ?? l.final_quotation_amount ?? l.final_amount ?? null;
            const finalPkgAmt = l.Final_Package_Amount ?? l.final_package_amount ?? finalQuoteAmt;
            const cleanLostReason = l.Lost_Reason || l.lost_reason || l.LostReason || l.lostReason || '';
            const cleanLostNotes = l.Lost_Notes || l.lost_notes || l.LostNotes || l.lostNotes || '';
            const cleanEventName = (l.custom_event_name || l.event_name || '').toString().trim();
            return { 
              ...l, 
              event_name: cleanEventName,
              custom_event_name: cleanEventName,
              Lost_Reason: cleanLostReason,
              lost_reason: cleanLostReason,
              Lost_Notes: cleanLostNotes,
              lost_notes: cleanLostNotes,
              Final_Quotation_Amount: finalQuoteAmt !== null && finalQuoteAmt !== undefined && !isNaN(Number(finalQuoteAmt)) ? Number(finalQuoteAmt) : null,
              Final_Package_Amount: finalPkgAmt !== null && finalPkgAmt !== undefined && !isNaN(Number(finalPkgAmt)) ? Number(finalPkgAmt) : null,
              final_package_amount: finalPkgAmt !== null && finalPkgAmt !== undefined && !isNaN(Number(finalPkgAmt)) ? Number(finalPkgAmt) : undefined,
              Team_member: teamData, 
              Team_Members: teamData, 
              team_members: teamData,
              status: finalStatus, 
              current_status: finalStatus, 
              events: evts 
            };
          });
          setLeads(parsedLeads);
        }
        
        if (dbOrders) {
           setOrders(dbOrders.map((o: any) => ({ ...o, current_stage: o.current_stage || o.order_status })));
        }
        if (dbOperations) setOperations(dbOperations);
        if (dbRawFootage) setRawFootage(dbRawFootage);
        if (dbProduction) {
          const enrichedProduction = dbProduction.map((item: any) => {
            const valUploads = (item.validated_server_uploads && typeof item.validated_server_uploads === 'object') ? item.validated_server_uploads : {};
            return {
              ...item,
              delivery_method: item.delivery_method || valUploads.delivery_method || undefined,
              server_link: item.server_link || valUploads.server_link || (valUploads.delivery_method === 'server_link' ? item.delivery_link : undefined),
              physical_drive_details: item.physical_drive_details || valUploads.physical_drive_details || undefined
            };
          });
          setProduction(enrichedProduction);
        }
        if (dbPayments) setPayments(dbPayments);
        if (dbPaymentHistory) {
          let rejectedIds = new Set<string>();
          try {
            const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
            if (rejectedSaved) rejectedIds = new Set(JSON.parse(rejectedSaved));
          } catch (_) {}

          const mappedHistory = dbPaymentHistory.map((h: any) => {
            const histId = String(h.id || h.payment_history_id || '');
            const isExplicitlyRejected = h.approval_status === 'Rejected' || 
              rejectedIds.has(histId) ||
              (typeof h.notes === 'string' && (
                h.notes.includes('Rejected') || 
                h.notes.includes('[REJECTED]') || 
                h.notes.endsWith('- Rejected') || 
                h.notes.toLowerCase().includes('rejected by business owner')
              ));

            const isPending = !isExplicitlyRejected && (
              h.approval_status === 'Waiting for Approval' || 
              (typeof h.notes === 'string' && h.notes.includes('Waiting for Approval'))
            );

            return {
              ...h,
              approval_status: isExplicitlyRejected ? 'Rejected' : (isPending ? 'Waiting for Approval' : 'Approved')
            };
          });
          setPaymentHistory(mappedHistory);
        }
        try {
          const cachedApprovals = localStorage.getItem('pending_payment_approvals');
          if (cachedApprovals) {
            const parsed = JSON.parse(cachedApprovals);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPaymentHistory(prev => {
                const map = new Map(prev.map(p => [p.id || p.payment_history_id, p]));
                parsed.forEach((item: any) => {
                  const key = item.id || item.payment_history_id;
                  if (key) map.set(key, item);
                });
                return Array.from(map.values());
              });
            }
          }
        } catch (_) {}
        if (dbLogs) setLogs(dbLogs);
        if (dbHandovers && dbHandovers.length > 0) {
          setEquipmentHandovers(dbHandovers);
        } else if (dbLeadEquipmentHistory && dbLeadEquipmentHistory.length > 0) {
          const mappedFromHistory = dbLeadEquipmentHistory.map((deh: any) => ({
            handover_id: deh.id,
            order_id: deh.order_id || deh.lead_id,
            equipment_name: deh.equipment_name,
            return_status: (deh.equipment_status === 'Returned' || deh.equipment_status === 'Equipment Handover Completed') ? 'Returned' : (deh.equipment_status || 'Returned'),
            return_date: deh.returned_at ? deh.returned_at.split('T')[0] : (deh.created_at ? deh.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
            returned_by: deh.returned_by || 'Staff',
            notes: deh.remarks || '',
            created_at: deh.created_at || deh.returned_at
          }));
          setEquipmentHandovers(mappedFromHistory);
        }
        if (dbSpecList) setSpecialities(dbSpecList);
        if (dbAssignList) {
          let cachedAssignments: EditorAssignment[] = [];
          try {
            const saved = localStorage.getItem('erp_editor_assignments');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) cachedAssignments = parsed;
            }
          } catch (_) {}

          setEditorAssignments(dbAssignList.map((item: any) => {
            const cached = cachedAssignments.find(c => c.assignment_id === item.assignment_id);
            return {
              ...cached,
              ...item,
              Edited_Drive_Link: item.Edited_Drive_Link || item.edited_drive_link || cached?.Edited_Drive_Link || cached?.edited_drive_link || null,
              edited_drive_link: item.edited_drive_link || item.Edited_Drive_Link || cached?.edited_drive_link || cached?.Edited_Drive_Link || null,
              confirmation_proof: item.confirmation_proof || cached?.confirmation_proof || null,
              customer_communication_proof: item.customer_communication_proof || cached?.customer_communication_proof || null,
              client_communication_proof: item.client_communication_proof || cached?.client_communication_proof || null,
              customer_review_image: item.customer_review_image || cached?.customer_review_image || null,
              proof_url: item.proof_url || cached?.proof_url || null,
              proof_image: item.proof_image || cached?.proof_image || null,
              uploaded_proof: item.uploaded_proof || cached?.uploaded_proof || null,
              server_upload_confirmed: item.server_upload_confirmed ?? cached?.server_upload_confirmed ?? false,
              server_upload_event_date: item.server_upload_event_date || cached?.server_upload_event_date || '',
              server_upload_folder_name: item.server_upload_folder_name || item.folder_name || cached?.server_upload_folder_name || cached?.folder_name || '',
              folder_name: item.folder_name || item.server_upload_folder_name || cached?.folder_name || cached?.server_upload_folder_name || '',
              server_upload_confirmed_at: item.server_upload_confirmed_at || cached?.server_upload_confirmed_at || '',
              server_upload_confirmed_by: item.server_upload_confirmed_by || cached?.server_upload_confirmed_by || '',
              edited_folder_uploaded_to_server: item.edited_folder_uploaded_to_server ?? cached?.edited_folder_uploaded_to_server ?? false,
              server_file_link: item.server_file_link || item.upload_link || item.upload_link_path || cached?.server_file_link || cached?.upload_link || '',
              upload_link: item.upload_link || item.server_file_link || cached?.upload_link || '',
              upload_link_path: item.upload_link_path || item.server_file_link || cached?.upload_link_path || ''
            };
          }));
        }
        
        if (dbStaff) {
           const usersForStaff = dbUsers ? dbUsers.map(mapUserFieldsFromDb) : users;
           setStaff(dbStaff.map((item: any) => {
              let extra: any = {};
              if (item.notes && item.notes.trim().startsWith('{') && item.notes.trim().endsWith('}')) {
                try { extra = JSON.parse(item.notes); } catch (e) {}
              }
              const mappedItem: any = {
                ...item,
                ...extra,
                staff_id: mapFromDbStaffId(item.staff_id),
                notes: (item.notes && item.notes.trim().startsWith('{') && item.notes.trim().endsWith('}')) ? (extra.notes || '') : item.notes,
                Skill: Array.isArray(item.Skill) ? item.Skill : (typeof item.Skill === 'string' ? item.Skill.split(',').map(s=>s.trim()).filter(Boolean) : (Array.isArray(extra.Skill) ? extra.Skill : [])),
                Staff_Type: item.Staff_Type || extra.Staff_Type || 'In-House'
              };
              const pwd = getStaffCurrentPassword(mappedItem, usersForStaff);
              if (pwd) mappedItem.password = pwd;
              return mappedItem;
           }));
        }

        if (dbProdStaff) {
           const usersForStaff = dbUsers ? dbUsers.map(mapUserFieldsFromDb) : users;
           setProductionStaff(dbProdStaff.map(item => {
             const mappedItem: any = mapProductionStaffFromDb(item);
             const pwd = getStaffCurrentPassword(mappedItem, usersForStaff);
             if (pwd) mappedItem.password = pwd;
             return mappedItem;
           }));
        }
        
        if (dbNotifications) {
          setNotifications(dbNotifications.map(mapNotificationFromDb));
        }
        if (dbEquipment && dbEquipment.length > 0) {
          const mappedEquipment = dbEquipment.map((item: any) => ({
            ...item,
            equipment_id: mapFromDbEquipmentId(item.equipment_id || item.id),
            equipment_name: item.equipment_name || 'Unnamed Gear',
            equipment_type: item.equipment_type || 'Other'
          }));
          setEquipment(mappedEquipment);
          try {
            localStorage.setItem('erp_equipment', JSON.stringify(mappedEquipment));
          } catch (_) {}
        } else if (dbEquipment && dbEquipment.length === 0) {
          setEquipment([]);
        } else {
        }
        if (dbLeadPackages) setLeadPackages(dbLeadPackages);
        
        let finalPackagesData = dbPackages || [];
        if (!finalPackagesData || finalPackagesData.length < 10) {
          try {
            const proxyRes = await fetch('/api/db/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: 'packages' })
            });
            const parsed = await safeParseResponse(proxyRes);
            if (parsed.ok && parsed.isJson) {
              const proxyJson = parsed.data;
              if (proxyJson && proxyJson.success && Array.isArray(proxyJson.data) && proxyJson.data.length > finalPackagesData.length) {
                finalPackagesData = proxyJson.data;
              }
            }
          } catch (e) {
            console.warn('[RoleContext] Proxy fetch packages fallback error:', e);
          }
        }

        // Retrieve deleted package IDs from localStorage so deleted items never resurrect on page reload
        let deletedPkgIds: string[] = [];
        try {
          const delStr = localStorage.getItem('erp_deleted_package_ids');
          if (delStr) {
            const parsedDel = JSON.parse(delStr);
            if (Array.isArray(parsedDel)) deletedPkgIds = parsedDel.map(String);
          }
        } catch (_) {}

        // Map fetched package data from database
        const mappedDbPkgs = (finalPackagesData && finalPackagesData.length > 0) 
          ? finalPackagesData
              .map(mapDbRecordToPackage)
              .filter(p => p && p.package_id && !deletedPkgIds.includes(String(p.package_id)))
          : [];
        
        const pkgMap = new Map<string, Package>();
        // Only include INITIAL_PACKAGES that have not been deleted
        (INITIAL_PACKAGES || [])
          .filter(p => p && p.package_id && !deletedPkgIds.includes(String(p.package_id)))
          .forEach(p => pkgMap.set(String(p.package_id), p));

        mappedDbPkgs.forEach(p => pkgMap.set(String(p.package_id), p));

        // Sync all custom categories found in packages to persistent storage
        try {
          mappedDbPkgs.forEach(p => {
            if (p.category) saveCustomCategoryToStorage(p.category);
            if (p.event_type) saveCustomCategoryToStorage(p.event_type);
          });
        } catch (_) {}

        setPackages(Array.from(pkgMap.values()));
        if (dbCalendarMemos) setCalendarMemos(dbCalendarMemos);
        if (dbStaffAssignments) {
          let cachedAssignments: any[] = [];
          try {
            const raw = localStorage.getItem('erp_staff_assignments');
            if (raw) cachedAssignments = JSON.parse(raw);
          } catch (e) {}

          const enriched = dbStaffAssignments.map((sa: any) => {
            let staffName = sa.staff_name || '';
            if (staffName.includes('__SLOT__')) {
              staffName = staffName.split('__SLOT__')[0];
            }
            const cleanSa = { 
              ...sa, 
              staff_name: staffName,
              staff_role: sa.staff_role ? sa.staff_role.trim() : sa.staff_role
            };

            // 1. Direct match by assignment_id
            let cached = cachedAssignments.find((c: any) => 
              c.assignment_id && cleanSa.assignment_id && c.assignment_id === cleanSa.assignment_id
            );

            // 2. Match by task_id
            if (!cached && cleanSa.task_id) {
              cached = cachedAssignments.find((c: any) => 
                c.task_id && c.task_id === cleanSa.task_id
              );
            }

            // 3. Match within the same event_id
            if (!cached && cleanSa.order_id) {
              cached = cachedAssignments.find((c: any) => 
                c.order_id === cleanSa.order_id &&
                (c.staff_id === cleanSa.staff_id || (c.staff_name && cleanSa.staff_name && c.staff_name.toLowerCase() === cleanSa.staff_name.toLowerCase())) &&
                (cleanSa.event_id ? c.event_id === cleanSa.event_id : true)
              );
            }

            let resolvedEq: string[] = [];
            const rawDbEq = cleanSa.equipment || cleanSa.assigned_equipment;
            if (Array.isArray(rawDbEq) && rawDbEq.length > 0) {
              resolvedEq = rawDbEq.filter((item: any) => typeof item === 'string' && item.trim());
            } else if (typeof rawDbEq === 'string' && rawDbEq.trim()) {
              try {
                const parsed = JSON.parse(rawDbEq);
                if (Array.isArray(parsed)) resolvedEq = parsed.filter((item: any) => typeof item === 'string' && item.trim());
              } catch(e) {
                const cleaned = rawDbEq.replace(/^\{|\}$/g, '');
                if (cleaned) resolvedEq = cleaned.split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
              }
            } else if (cached && Array.isArray(cached.equipment) && cached.equipment.length > 0) {
              resolvedEq = cached.equipment;
            }

            // Resolve event_id rigorously: from DB column, then from deterministic ID pattern, then cached
            let resolvedEventId = cleanSa.event_id || '';
            if (!resolvedEventId && cleanSa.assignment_id && cleanSa.assignment_id.startsWith('ASST-')) {
              const parts = cleanSa.assignment_id.split('-');
              if (parts.length >= 3 && parts[2]) resolvedEventId = parts[2];
            }
            if (!resolvedEventId && cleanSa.task_id && cleanSa.task_id.startsWith('TASK_')) {
              const parts = cleanSa.task_id.split('_');
              if (parts.length >= 3 && parts[2]) resolvedEventId = parts[2];
            }
            if (!resolvedEventId && cached?.event_id) {
              resolvedEventId = cached.event_id;
            }

            let resolvedEventName = cleanSa.event_name || cached?.event_name || '';
            let resolvedMobile = cleanSa.mobile || cached?.mobile || '';
            let resolvedStaffType = cleanSa.staff_type || cached?.staff_type || 'In-House';

            return {
              ...cleanSa,
              event_id: resolvedEventId,
              event_name: resolvedEventName,
              equipment: resolvedEq,
              mobile: resolvedMobile,
              staff_type: resolvedStaffType
            };
          });

          try {
            localStorage.setItem('erp_staff_assignments', JSON.stringify(enriched));
          } catch (e) {}

          setStaffAssignments(enriched);
        }
        
        if (dbQuotations) {
          setQuotations(dbQuotations.map((q: any) => {
             let srv = q.services_included;
             if (typeof srv === 'string') {
               try { srv = JSON.parse(srv); } catch(e){}
             }
             if (srv && !Array.isArray(srv) && typeof srv === 'object' && srv.services) {
               srv = srv.services;
             }
             return { ...q, services_included: Array.isArray(srv) ? srv : [] };
          }));
        }
        
        if (dbStatusHistory) setStatusHistory(dbStatusHistory);
        if (dbLeadStaffAssignmentHistory) setLeadStaffAssignmentHistory(dbLeadStaffAssignmentHistory);
        if (dbLeadEquipmentHistory) setLeadEquipmentHistory(dbLeadEquipmentHistory);

        // Fetch unified Client Acceptance Verifications
        try {
          const caRes = await fetch('/api/client-acceptance/list');
          const parsedCa = await safeParseResponse(caRes);
          if (parsedCa.ok && parsedCa.isJson && parsedCa.data?.success && Array.isArray(parsedCa.data?.data)) {
            setClientAcceptanceVerifications(parsedCa.data.data);
          }
        } catch (caErr) {
          console.warn('[RoleContext] Error loading client acceptance verifications:', caErr);
        }
        
        updateDiagnosticMetric('read', 'ok');
        updateDiagnosticMetric('connection', 'connected');

        runAgain = fetchPendingRef.current;
      }
    } catch (err: any) {
      console.error('Data fetch error:', err);
      window.alert(`Database Fetch Error: ${err.message}`);
    } finally {
      isFetchingRef.current = false;
      fetchPendingRef.current = false;
      activeFetchPromiseRef.current = null;
      setIsDataLoading(false);
    }
  })();

  activeFetchPromiseRef.current = fetchPromise;
  return fetchPromise;
};

  // Listen to Supabase Auth state changes to synchronize session and handle on-the-fly profiles
  useEffect(() => {
    if (!supabaseClient) return;

    const syncProfileAndSession = async (session: any) => {
      if (!session || !session.user) {
        return;
      }
      const authUser = session.user;
      const email = authUser.email?.toLowerCase().trim();
      
      // Skip DB fetch if already logged in via login function or currently logging in
      if (isLoggingInRef.current) {
        console.log(`[SYNC SESSION] Skipping fetch for ${email} because login is in progress.`);
        return;
      }
      if (currentUserRef.current && currentUserRef.current.id === mapFromDbUserId(authUser.id)) {
        console.log(`[SYNC SESSION] Skipping fetch for ${email} because user is already set.`);
        return;
      }

      console.log(`[SYNC SESSION] Syncing profile for ${email} / Auth ID: ${authUser.id}`);
      
      // Look up profile in public.users table
      let dbUser: any = null;
      try {
        const { data: userById } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        
        dbUser = userById;

        if (!dbUser && email) {
          const { data: userByEmail } = await supabaseClient
            .from('users')
            .select('*')
            .ilike('email', email)
            .maybeSingle();
          
          if (userByEmail) {
            console.log(`[SYNC SESSION] Found user profile by email ${email} with different ID ${userByEmail.id}. Aligning ID to auth ID ${authUser.id}`);
            const { error: updateIdErr } = await supabaseClient
              .from('users')
              .update({ id: authUser.id })
              .eq('email', userByEmail.email);
            
            if (!updateIdErr) {
              dbUser = { ...userByEmail, id: authUser.id };
            } else {
              dbUser = userByEmail;
            }
          }
        }

        // Additional fallback: lookup by user_metadata mobile
        const metaMobile = authUser.user_metadata?.mobile;
        if (!dbUser && metaMobile) {
          const { data: userByMobile } = await supabaseClient
            .from('users')
            .select('*')
            .eq('mobile', metaMobile)
            .maybeSingle();
          if (userByMobile) {
            dbUser = userByMobile;
          }
        }
      } catch (err: any) {
        console.warn("[SYNC SESSION] Error searching for user profile:", err?.message || err);
      }

      let finalProfileUser: User | null = null;

      if (dbUser) {
        finalProfileUser = mapUserFieldsFromDb(dbUser);
        console.log(`[SYNC SESSION] Loaded profile successfully. Role: ${finalProfileUser.role}`);
      } else {
        // Check localStorage to avoid kicking out an already active session
        try {
          const savedStr = localStorage.getItem('erp_current_user');
          if (savedStr) {
            const saved = JSON.parse(savedStr);
            if (saved && (saved.email?.toLowerCase() === email || saved.id === mapFromDbUserId(authUser.id))) {
              finalProfileUser = saved;
            }
          }
        } catch (e) {}

        if (!finalProfileUser) {
          console.warn(`Profile missing in DB for auth user ${email}. Retaining current session if active.`);
          return;
        }
      }

      // Check if user is active
      if (finalProfileUser && !finalProfileUser.active) {
        console.warn(`[SYNC SESSION] User is deactivated. Logging out.`);
        logout();
        return;
      }

      if (finalProfileUser) {
        // Update states
        setCurrentUser(finalProfileUser);
        setCurrentRoleState(finalProfileUser.role);
        setCurrentUserNameState(finalProfileUser.name);
        
        // Update local storage
        localStorage.setItem('erp_current_user', JSON.stringify(finalProfileUser));
        localStorage.setItem('erp_role', finalProfileUser.role);
        localStorage.setItem('erp_user_name', finalProfileUser.name);
      }
    };

    // Check initial session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        syncProfileAndSession(session);
      }
    }).catch(e => {
      console.warn("Supabase getSession failed:", e?.message || String(e));
    });

    // Subscribe to auth state changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log(`[SUPABASE AUTH EVENT]: ${event}`);
      if (session) {
        await syncProfileAndSession(session);
      } else {
        // If they signed out, clear current user
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          localStorage.removeItem('erp_current_user');
          localStorage.removeItem('erp_role');
          localStorage.removeItem('erp_user_name');
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Synchronous database fetching and real-time subscription channels
  useEffect(() => {
    fetchFromDb(true);

    if (!supabaseClient) return;

    const channels = [
      { table: 'users', key: 'id', setter: setUsers },
      { table: 'leads', key: 'lead_id', setter: setLeads },
      { table: 'orders', key: 'order_id', setter: setOrders },
      { table: 'operations', key: 'operation_id', setter: setOperations },
      { table: 'raw_footage', key: 'tracking_id', setter: setRawFootage },
      { table: 'production', key: 'production_id', setter: setProduction },
      { table: 'payments', key: 'payment_id', setter: setPayments },
      { table: 'operations_staff', key: 'staff_id', setter: setStaff },
      { table: 'production_staff', key: 'staff_id', setter: setProductionStaff },
      { table: 'activity_logs', key: 'log_id', setter: setLogs },
      { table: 'notifications', key: 'notification_id', setter: setNotifications },
      { table: 'equipment', key: 'equipment_id', setter: setEquipment },
      { table: 'production_specialties', key: 'speciality_id', setter: setSpecialities },
      { table: 'editor_assignments', key: 'assignment_id', setter: setEditorAssignments },
      { table: 'staff_assignments', key: 'assignment_id', setter: setStaffAssignments },
      { table: 'lead_packages', key: 'lead_package_id', setter: setLeadPackages },
      { table: 'quotations', key: 'quotation_id', setter: setQuotations },
      { table: 'lead_status_history', key: 'id', setter: setStatusHistory },
      { table: 'lead_staff_assignment_history', key: 'id', setter: setLeadStaffAssignmentHistory },
      { table: 'lead_equipment_history', key: 'id', setter: setLeadEquipmentHistory },
      { table: 'packages', key: 'package_id', setter: setPackages },
      { table: 'calendar_memos', key: 'id', setter: setCalendarMemos },
      { table: 'payment_history', key: 'id', setter: setPaymentHistory }
    ].map(({ table, key, setter }) => {
      return supabaseClient
        .channel(`rt-${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => {
            updateDiagnosticMetric('realtime', 'ok');
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              setter((prev: any[]) => {
                const item = payload.new;
                let mappedItem = table === 'users' ? { ...item, id: mapFromDbUserId(item.id) } : item;
                if (table === 'notifications') mappedItem = mapNotificationFromDb(item);
                if (table === 'leads') {
                  const existingLead = prev.find((l: any) => l.lead_id === mappedItem.lead_id);
                  let finalEvents = mappedItem.events && Array.isArray(mappedItem.events) && mappedItem.events.length > 0 
                    ? mappedItem.events 
                    : (existingLead?.events || []);
                  if (finalEvents.length === 0) {
                    finalEvents = deserializeLeadEvents(mappedItem.notes_special_customizations).events || [];
                  }

                  finalEvents = finalEvents.map((e: any, idx: number) => {
                    const eId = e.id || e.event_id || `EVT-0${idx + 1}`;
                    const eName = e.event_name || e.custom_event_name || e.event_type || `Event ${idx + 1}`;

                    let eventDeliverables = e.deliverables;
                    if ((!eventDeliverables || (Array.isArray(eventDeliverables) && eventDeliverables.length === 0)) && (mappedItem.deliverables_description || existingLead?.deliverables_description)) {
                      const delText = mappedItem.deliverables_description || existingLead?.deliverables_description;
                      const parsed = parseDeliverablesWithQty(delText, eName, eId, idx);
                      if (parsed.length > 0) {
                        eventDeliverables = parsed;
                      }
                    }

                    let eventTeamMembers = e.team_members || e.Team_Members;
                    if ((!eventTeamMembers || (Array.isArray(eventTeamMembers) && eventTeamMembers.length === 0)) && (mappedItem.team_members || mappedItem.Team_member || mappedItem.Team_Members || existingLead?.team_members)) {
                      const rawTm = mappedItem.team_members || mappedItem.Team_member || mappedItem.Team_Members || existingLead?.team_members;
                      const parsedTm = parseTeamMembers(rawTm, eName, eId, idx);
                      if (parsedTm.length > 0) {
                        eventTeamMembers = parsedTm;
                      }
                    }

                    return {
                      ...e,
                      id: eId,
                      event_id: eId,
                      event_name: eName,
                      deliverables: eventDeliverables || [],
                      team_members: eventTeamMembers || []
                    };
                  });

                  mappedItem = { 
                    ...mappedItem, 
                    status: mappedItem.current_status || mappedItem.status || 'New Lead', 
                    current_status: mappedItem.current_status || mappedItem.status || 'New Lead',
                    events: finalEvents
                  };
                }
                if (table === 'orders') mappedItem = { ...mappedItem, current_stage: mappedItem.current_stage || mappedItem.order_status };
                if (table === 'payment_history') {
                  let rejectedIds = new Set<string>();
                  try {
                    const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
                    if (rejectedSaved) rejectedIds = new Set(JSON.parse(rejectedSaved));
                  } catch (_) {}

                  const histId = String(mappedItem.id || mappedItem.payment_history_id || '');
                  const isExplicitlyRejected = mappedItem.approval_status === 'Rejected' || 
                    rejectedIds.has(histId) ||
                    (typeof mappedItem.notes === 'string' && (
                      mappedItem.notes.includes('Rejected') || 
                      mappedItem.notes.includes('[REJECTED]') || 
                      mappedItem.notes.endsWith('- Rejected') || 
                      mappedItem.notes.toLowerCase().includes('rejected by business owner')
                    ));

                  const isPending = !isExplicitlyRejected && (
                    mappedItem.approval_status === 'Waiting for Approval' || 
                    (typeof mappedItem.notes === 'string' && mappedItem.notes.includes('Waiting for Approval'))
                  );

                  mappedItem = {
                    ...mappedItem,
                    approval_status: isExplicitlyRejected ? 'Rejected' : (isPending ? 'Waiting for Approval' : 'Approved')
                  };
                }
                if (table === 'operations_staff') {
                  let extra: any = {};
                  if (item.notes && item.notes.trim().startsWith('{') && item.notes.trim().endsWith('}')) {
                    try { extra = JSON.parse(item.notes); } catch (e) {}
                  }
                  mappedItem = { ...item, ...extra, staff_id: mapFromDbStaffId(item.staff_id), notes: extra.notes || item.notes };
                }
                if (table === 'production_staff') {
                  mappedItem = mapProductionStaffFromDb(item);
                }
                if (table === 'packages') mappedItem = mapDbRecordToPackage(item);
                if (table === 'equipment') mappedItem = { ...item, equipment_id: mapFromDbEquipmentId(item.equipment_id) };
                
                const exists = prev.some((x: any) => x[key] === mappedItem[key]);
                if (exists) {
                  return prev.map((x: any) => (x[key] === mappedItem[key] ? mappedItem : x));
                } else {
                  if (['leads', 'orders', 'activity_logs', 'notifications'].includes(table)) {
                    return [mappedItem, ...prev];
                  } else {
                    return [...prev, mappedItem];
                  }
                }
              });
            } else if (payload.eventType === 'DELETE') {
              setter((prev: any[]) => {
                const oldItem = payload.old;
                const matchVal = table === 'users' ? mapFromDbUserId(oldItem.id) : oldItem[key];
                return prev.filter(x => x[key] !== matchVal);
              });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            updateDiagnosticMetric('realtime', 'ok');
          } else {
            updateDiagnosticMetric('realtime', 'fail');
          }
        });
    });

    const leadEventsChannel = supabaseClient.channel('rt-lead_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_events' }, (payload) => {
        updateDiagnosticMetric('realtime', 'ok');
        fetchFromDb(false).catch(e => console.warn('fetchFromDb failed:', e?.message || e));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          updateDiagnosticMetric('realtime', 'ok');
        } else {
          updateDiagnosticMetric('realtime', 'fail');
        }
      });

    // Handle window focus and document visibility to fetch fresh data when user returns to app
    const handleFocusOrVisible = () => {
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 2000) {
        return;
      }
      console.log("[SYNC] App focused/visible, pulling fresh database records...");
      fetchFromDb(false).catch(e => console.warn('fetchFromDb failed:', e?.message || e));
    };

    window.addEventListener('focus', handleFocusOrVisible);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocusOrVisible();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Background polling fallback every 4 seconds to guarantee immediate synchronization with external DB updates
    const pollingInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return; // Skip polling if tab is hidden
      }
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 4000) {
        return; // Skip polling if we fetched recently
      }
      fetchFromDb(false).catch(e => console.warn('fetchFromDb polling failed:', e?.message || e));
    }, 4000);

    // Realtime subscriptions handle granular updates. No global sync needed.
    return () => {
      channels.forEach(ch => supabaseClient.removeChannel(ch));
      supabaseClient.removeChannel(leadEventsChannel);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(pollingInterval);
    };
  }, []);

  const broadcastSyncPing = async () => {
    fetchFromDb(false).catch(e => console.warn('fetchFromDb failed:', e?.message || e));
  };



  // Handle auto-logout if user is deactivated
  useEffect(() => {
    if (currentUser && (users.length > 0 || staff.length > 0 || productionStaff.length > 0)) {
      let isActive = true; // Default to true if not found yet
      let roleToSync = currentUser.role;
      let nameToSync = currentUser.name;
      let found = false;

      // Check specific staff tables first based on user role to avoid stale override from users table
      if (currentUser.role === 'Production Staff') {
        const prodUser = productionStaff.find(s => 
          s.staff_id === currentUser.id || 
          (s.email && currentUser.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) || 
          (s.mobile && currentUser.mobile && s.mobile === currentUser.mobile)
        );
        if (prodUser) {
          isActive = prodUser.status !== 'Inactive' && prodUser.status !== 'inactive';
          roleToSync = 'Production Staff';
          nameToSync = prodUser.name;
          found = true;
        }
      } else if (currentUser.role === 'Operation Staff') {
        const staffUser = staff.find(s => 
          s.staff_id === currentUser.id || 
          (s.email && currentUser.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) || 
          (s.mobile && currentUser.mobile && s.mobile === currentUser.mobile)
        );
        if (staffUser) {
          isActive = staffUser.status !== 'Inactive' && staffUser.status !== 'inactive';
          roleToSync = 'Operation Staff';
          nameToSync = staffUser.name;
          found = true;
        }
      }

      if (!found) {
        const dbUser = users.find(u => 
          u.id === currentUser.id || 
          (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || 
          (u.mobile && currentUser.mobile && u.mobile === currentUser.mobile)
        );
        if (dbUser) {
          isActive = dbUser.active !== false && dbUser.active !== 'false';
          roleToSync = dbUser.role || currentUser.role;
          nameToSync = dbUser.name || currentUser.name;
          found = true;
        }
      }

      if (found) {
        if (!isActive) {
          // Double-check directly with the database before logging out to prevent stale in-memory state from falsely kicking out an active user
          const verifyAndHandleLogout = async () => {
            const dbTargetId = mapToDbUserId(currentUser.id);
            let liveStatus: boolean | null = null;
            try {
              const res = await fetch('/api/db/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'users', matchColumn: 'id', matchValue: dbTargetId })
              });
              const resData = await res.json();
              if (resData.success && resData.data?.[0]) {
                const row = resData.data[0];
                liveStatus = row.active !== false && row.active !== 'false';
              }
            } catch (e) {
              console.warn("[syncSession] Live DB status check error:", e);
            }

            // Also check by email if not resolved by ID
            if (liveStatus === null && currentUser.email) {
              try {
                const res = await fetch('/api/db/select', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ table: 'users', matchColumn: 'email', matchValue: currentUser.email.trim().toLowerCase() })
                });
                const resData = await res.json();
                if (resData.success && resData.data?.[0]) {
                  const row = resData.data[0];
                  liveStatus = row.active !== false && row.active !== 'false';
                }
              } catch (e) {}
            }

            if (liveStatus === true) {
              // The database confirms user is ACTIVE! Stale in-memory state was outdated. Update users state and DO NOT log out.
              setUsers(prev => prev.map(u => {
                const match = u.id === currentUser.id || 
                              mapToDbUserId(u.id) === dbTargetId || 
                              (currentUser.email && u.email && u.email.toLowerCase() === currentUser.email.toLowerCase());
                return match ? { ...u, active: true } : u;
              }));
              return;
            }

            // User is indeed deactivated in the database
            logout();
            alert('Your account is no longer active. You have been logged out.');
          };

          verifyAndHandleLogout();
        } else if (roleToSync !== currentUser.role || nameToSync !== currentUser.name) {
          setCurrentUser({ ...currentUser, role: roleToSync, name: nameToSync });
          setCurrentRoleState(roleToSync);
          setCurrentUserNameState(nameToSync);
        }
      }
    }
  }, [users, staff, productionStaff, currentUser]);

  // Sync username with role switcher for smooth demo
  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    if (role === 'Business Owner') setCurrentUserNameState('Rupand Das');
    else if (role === 'Sales Team') setCurrentUserNameState('Sarah Jenkins');
    else if (role === 'Operations Team') setCurrentUserNameState('Robert O\'Connor');
    else if (role === 'Production Team') setCurrentUserNameState('Emily Watson');
  };

  const setCurrentUserName = (name: string) => {
    setCurrentUserNameState(name);
  };

  // Login action
  const login = async (emailOrUsername: string, password: string) => {
    isLoggingInRef.current = true;
    try {
      const cleanInput = emailOrUsername.trim();
      let dbUser: any = null;

      if (!cleanInput) {
        return { success: false, error: 'Username or Email is required.' };
      }
      if (!password) {
        return { success: false, error: 'Password is required.' };
      }

      const logAttempt = (status: string, reason: string, userId?: string) => {
        console.log(`[LOGIN ${status}] ${cleanInput} - ${reason}`);
        if (supabaseClient) {
          supabaseClient.from('login_logs').insert({
            username_or_email: cleanInput,
            user_id: userId || null,
            login_status: status,
            failure_reason: reason,
            user_agent: navigator.userAgent
          }).then(({ error }) => {
            if (error) console.warn('Failed to write to login_logs:', error);
          });
        }
      };

      if (!supabaseClient) {
        return { success: false, error: 'Database client is not initialized.' };
      }

      // Step 1: Look up user profile safely by Email, Mobile, or Username directly from public.users
      const rawDigits = cleanInput.replace(/\D/g, '');
      const last10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
      const cleanPassword = password.trim();

      let candidateUsers: any[] = [];

      try {
        // Query live server proxy first for fresh, non-cached users list
        let dbList: any[] = [];
        try {
          const srvRes = await fetch('/api/db/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: 'users' })
          });
          const srvData = await srvRes.json();
          if (srvData.success && Array.isArray(srvData.data) && srvData.data.length > 0) {
            dbList = srvData.data;
          }
        } catch (srvErr) {
          console.warn('[LOGIN] Server select proxy fallback:', srvErr);
        }

        if (dbList.length === 0 && supabaseClient) {
          const { data: allUsers } = await supabaseClient.from('users').select('*');
          if (allUsers && allUsers.length > 0) {
            dbList = allUsers;
          }
        }

        if (dbList.length > 0) {
          candidateUsers = dbList.filter(u => {
            const uEmail = (u.email || '').trim().toLowerCase();
            const uUser = (u.username || '').trim().toLowerCase();
            const uPhone = (u.mobile || '').replace(/\D/g, '');
            const uPhoneLast10 = uPhone.length >= 10 ? uPhone.slice(-10) : uPhone;
            
            // Email matching
            if (cleanInput.includes('@') && uEmail === cleanInput.toLowerCase()) return true;
            if (uEmail && uEmail === cleanInput.toLowerCase()) return true;
            // Username matching
            if (uUser && uUser === cleanInput.toLowerCase()) return true;
            // Mobile matching: exact digits or last 10 digits
            if (rawDigits.length >= 7) {
              if (uPhone === rawDigits) return true;
              if (last10.length >= 7 && (uPhoneLast10 === last10 || uPhone.endsWith(last10))) return true;
            }
            return false;
          });
        }
      } catch (err: any) {
        console.warn('[LOGIN] Error querying users table:', err?.message || err);
      }

      // Check in-memory users list fallback if no candidates from DB query
      if (candidateUsers.length === 0 && users.length > 0) {
        candidateUsers = users.filter(u => {
          const uEmail = (u.email || '').trim().toLowerCase();
          const uUser = (u.username || '').trim().toLowerCase();
          const uPhone = (u.mobile || '').replace(/\D/g, '');
          const uPhoneLast10 = uPhone.length >= 10 ? uPhone.slice(-10) : uPhone;
          
          if (cleanInput.includes('@') && uEmail === cleanInput.toLowerCase()) return true;
          if (uEmail && uEmail === cleanInput.toLowerCase()) return true;
          if (uUser && uUser === cleanInput.toLowerCase()) return true;
          if (rawDigits.length >= 7) {
            if (uPhone === rawDigits) return true;
            if (last10.length >= 7 && (uPhoneLast10 === last10 || uPhone.endsWith(last10))) return true;
          }
          return false;
        });
      }

      // Fallback: Check in-memory staff lists (operations_staff, production_staff) if user record not yet created
      if (candidateUsers.length === 0) {
        let matchingStaff = staff.find(s => {
          const sEmail = (s.email || '').trim().toLowerCase();
          const sMobile = (s.mobile || '').replace(/\D/g, '');
          const sWa = (s.whatsapp_number || '').replace(/\D/g, '');
          const sNameEmail = s.name ? (s.name.toLowerCase().replace(/\s+/g, '') + '@photocrew.com') : '';
          
          if (sEmail && sEmail === cleanInput.toLowerCase()) return true;
          if (last10.length >= 7 && sMobile.endsWith(last10)) return true;
          if (last10.length >= 7 && sWa.endsWith(last10)) return true;
          if (sNameEmail && sNameEmail === cleanInput.toLowerCase()) return true;
          return false;
        });
        
        let fallbackRole: UserRole = 'Operation Staff';

        if (!matchingStaff) {
          matchingStaff = productionStaff.find(s => {
            const sEmail = (s.email || '').trim().toLowerCase();
            const sMobile = (s.mobile || '').replace(/\D/g, '');
            const sWa = (s.whatsapp_number || '').replace(/\D/g, '');
            const sNameEmail = s.name ? (s.name.toLowerCase().replace(/\s+/g, '') + '@photocrew.com') : '';
            
            if (sEmail && sEmail === cleanInput.toLowerCase()) return true;
            if (last10.length >= 7 && sMobile.endsWith(last10)) return true;
            if (last10.length >= 7 && sWa.endsWith(last10)) return true;
            if (sNameEmail && sNameEmail === cleanInput.toLowerCase()) return true;
            return false;
          });
          if (matchingStaff) {
            fallbackRole = 'Production Staff';
          }
        }

        if (matchingStaff) {
          const staffEmail = matchingStaff.email || `${matchingStaff.mobile ? matchingStaff.mobile.replace(/\D/g, '') : matchingStaff.name.toLowerCase().replace(/\s+/g, '')}@photocrew.com`;
          const newStaffUser = {
            id: matchingStaff.staff_id || `STAFF-${Date.now()}`,
            name: matchingStaff.name,
            email: staffEmail,
            username: staffEmail,
            mobile: matchingStaff.mobile || '',
            role: fallbackRole,
            active: matchingStaff.status !== 'Inactive'
          };

          // Save to users table so future direct queries find them
          try {
            await supabaseClient.from('users').upsert({
              id: newStaffUser.id,
              name: newStaffUser.name,
              email: newStaffUser.email,
              username: newStaffUser.username,
              mobile: newStaffUser.mobile,
              role: fallbackRole,
              active: newStaffUser.active,
              created_at: new Date().toISOString()
            }, { onConflict: 'email' });
          } catch (e) {
            console.warn('[LOGIN] Auto-sync fallback to users table warning:', e);
          }

          candidateUsers = [newStaffUser];
        }
      }

      let authSuccess = false;

      // 1. Authoritative check: verify credentials via Supabase Auth
      const candidateEmails = new Set<string>();
      for (const candidate of candidateUsers) {
        if (candidate.email) candidateEmails.add(candidate.email.trim().toLowerCase());
        if (candidate.username && candidate.username.includes('@')) candidateEmails.add(candidate.username.trim().toLowerCase());
      }
      if (cleanInput.includes('@')) candidateEmails.add(cleanInput.toLowerCase());

      // If matched production staff, add their email
      let matchedProd = productionStaff.find(s => {
        const sEmail = (s.email || '').trim().toLowerCase();
        const sMobile = (s.mobile || '').replace(/\D/g, '');
        const sWa = (s.whatsapp_number || '').replace(/\D/g, '');
        if (sEmail && sEmail === cleanInput.toLowerCase()) return true;
        if (rawDigits.length >= 7 && (sMobile === rawDigits || sMobile.endsWith(last10) || rawDigits.endsWith(sMobile))) return true;
        if (rawDigits.length >= 7 && (sWa === rawDigits || sWa.endsWith(last10))) return true;
        return false;
      });

      if (!matchedProd && supabaseClient) {
        try {
          const { data: dbPs } = await supabaseClient
            .from('production_staff')
            .select('*')
            .or(`email.ilike.${cleanInput},mobile.ilike.%${last10}%`);
          if (dbPs && dbPs.length > 0) {
            matchedProd = mapProductionStaffFromDb(dbPs[0]);
          }
        } catch (e) {}
      }

      if (matchedProd?.email) {
        candidateEmails.add(matchedProd.email.trim().toLowerCase());
      }
      if (matchedProd?.mobile) {
        candidateEmails.add(`${matchedProd.mobile.replace(/\D/g, '')}@photocrew.com`);
      }

      if (candidateEmails.size > 0 && supabaseClient) {
        for (const loginEmail of candidateEmails) {
          try {
            const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
              email: loginEmail,
              password: cleanPassword
            });

            if (!authErr && authData?.session) {
              authSuccess = true;
              dbUser = candidateUsers.find(u => u.email?.trim().toLowerCase() === loginEmail || u.username?.trim().toLowerCase() === loginEmail) || null;
              if (!dbUser && matchedProd) {
                const staffEmail = matchedProd.email || `${matchedProd.mobile ? matchedProd.mobile.replace(/\D/g, '') : matchedProd.name.toLowerCase().replace(/\s+/g, '')}@photocrew.com`;
                dbUser = {
                  id: matchedProd.staff_id || authData.user?.id || `STAFF-${Date.now()}`,
                  name: matchedProd.name,
                  email: staffEmail,
                  username: staffEmail,
                  mobile: matchedProd.mobile || '',
                  role: 'Production Staff',
                  active: matchedProd.status !== 'Inactive'
                };
              }
              break;
            }
          } catch (e: any) {
            console.warn("Supabase Auth sign in error:", e?.message || e);
          }
        }
      }

      // 2. Legacy fallback only for non-production accounts where Supabase Auth credentials have not been migrated
      if (!authSuccess && candidateUsers.length > 0) {
        for (const candidate of candidateUsers) {
          // Strictly forbid legacy fallback for Production Staff so old passwords are never accepted
          if (candidate.role === 'Production Staff' || candidate.role === 'Production Team') {
            continue;
          }
          const storedPwd = String(candidate.password ?? '').trim();
          if (storedPwd !== '' && storedPwd === cleanPassword) {
            authSuccess = true;
            dbUser = candidate;
            break;
          }
        }
      }

      if (!authSuccess || !dbUser) {
        const msg = 'Invalid email/username or password.';
        logAttempt('Failed', msg, dbUser?.id);
        return { success: false, error: msg };
      }

      // CRITICAL: Always check the latest account status from the database rather than using an old/cached status
      try {
        const dbTargetId = mapToDbUserId(dbUser.id);
        let freshStatusRecord: any = null;

        // 1. Direct Supabase query with fresh single select by ID
        if (supabaseClient) {
          try {
            const { data: directFresh } = await supabaseClient
              .from('users')
              .select('*')
              .eq('id', dbTargetId)
              .maybeSingle();
            if (directFresh) {
              freshStatusRecord = directFresh;
            }
          } catch (e) {}
        }

        // 2. Direct Supabase query by Email if not found
        if (!freshStatusRecord && dbUser.email && supabaseClient) {
          try {
            const { data: directByEmail } = await supabaseClient
              .from('users')
              .select('*')
              .ilike('email', dbUser.email.trim())
              .maybeSingle();
            if (directByEmail) {
              freshStatusRecord = directByEmail;
            }
          } catch (e) {}
        }

        // 3. Direct Supabase query by Mobile if not found
        if (!freshStatusRecord && dbUser.mobile && supabaseClient) {
          try {
            const { data: directByMobile } = await supabaseClient
              .from('users')
              .select('*')
              .eq('mobile', dbUser.mobile.trim())
              .maybeSingle();
            if (directByMobile) {
              freshStatusRecord = directByMobile;
            }
          } catch (e) {}
        }

        // 4. Server proxy query with service role key by ID (guarantees non-cached live read)
        if (!freshStatusRecord) {
          try {
            const srvRes = await fetch('/api/db/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'users',
                matchColumn: 'id',
                matchValue: dbTargetId
              })
            });
            const srvData = await srvRes.json();
            if (srvData.success && srvData.data?.[0]) {
              freshStatusRecord = srvData.data[0];
            }
          } catch (e) {}
        }

        // 5. Server proxy query by Email if not found
        if (!freshStatusRecord && dbUser.email) {
          try {
            const srvRes = await fetch('/api/db/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'users',
                matchColumn: 'email',
                matchValue: dbUser.email.trim().toLowerCase()
              })
            });
            const srvData = await srvRes.json();
            if (srvData.success && srvData.data?.[0]) {
              freshStatusRecord = srvData.data[0];
            }
          } catch (e) {}
        }

        // 6. Server proxy query by Mobile if not found
        if (!freshStatusRecord && dbUser.mobile) {
          try {
            const srvRes = await fetch('/api/db/select', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'users',
                matchColumn: 'mobile',
                matchValue: dbUser.mobile.trim()
              })
            });
            const srvData = await srvRes.json();
            if (srvData.success && srvData.data?.[0]) {
              freshStatusRecord = srvData.data[0];
            }
          } catch (e) {}
        }

        if (freshStatusRecord) {
          console.log(`[LOGIN STATUS CHECK] Fresh database status for ${dbUser.name}: active=${freshStatusRecord.active}`);
          dbUser = { ...dbUser, ...freshStatusRecord };
          // Keep in-memory users state updated with fresh database record across all matching references
          setUsers(prev => prev.map(u => {
            const match = u.id === dbUser.id || 
                          mapToDbUserId(u.id) === dbTargetId || 
                          u.id === dbTargetId ||
                          (dbUser.email && u.email && u.email.toLowerCase() === dbUser.email.toLowerCase()) ||
                          (dbUser.mobile && u.mobile && u.mobile === dbUser.mobile);
            return match ? { ...u, ...freshStatusRecord } : u;
          }));
        }
      } catch (statusErr) {
        console.warn("[LOGIN] Error verifying latest status from database:", statusErr);
      }

      // Validate active status strictly against the latest database state
      const isCurrentlyActive = dbUser.active !== false && dbUser.active !== 'false' && dbUser.active !== 0 && dbUser.active !== '0';
      if (!isCurrentlyActive) {
        const msg = 'Your account has been deactivated. Please contact the administrator.';
        logAttempt('Failed', msg, dbUser.id);
        return { success: false, error: msg };
      }

      // If active, ensure dbUser.active is true
      dbUser.active = true;

      // Validate role with case-insensitive normalization
      if (!dbUser.role) {
        const msg = 'User role is not configured.';
        logAttempt('Failed', msg, dbUser.id);
        return { success: false, error: msg };
      }

      // Explicit Production Staff Role Detection:
      // If dbUser is an actual Production Staff member (present in production_staff), ensure they are routed to Production Staff dashboard, NOT Production Team dashboard.
      // Do NOT touch dedicated Production Team accounts (e.g. production@photocrew.com).
      const isDedicatedProdTeamAccount =
        (dbUser.email || '').trim().toLowerCase() === 'production@photocrew.com' ||
        dbUser.id === '00000000-0000-0000-0000-000000000004';

      if (!isDedicatedProdTeamAccount) {
        const uEmail = (dbUser.email || '').trim().toLowerCase();
        const uMobile = (dbUser.mobile || '').replace(/\D/g, '');
        const matchedInProdStaff = productionStaff.some(ps => {
          if (ps.staff_id && ps.staff_id === dbUser.id) return true;
          const psEmail = (ps.email || '').trim().toLowerCase();
          const psMobile = (ps.mobile || '').replace(/\D/g, '');
          if (psEmail && uEmail && psEmail === uEmail) return true;
          if (psMobile && uMobile && psMobile.length >= 7 && (psMobile === uMobile || psMobile.endsWith(uMobile) || uMobile.endsWith(psMobile))) return true;
          return false;
        });

        if (matchedInProdStaff) {
          dbUser.role = 'Production Staff';
          if (supabaseClient) {
            supabaseClient.from('users').update({ role: 'Production Staff' }).eq('id', dbUser.id).then(() => null);
          }
        }
      }

      const normalizeUserRole = (rawRole: string): UserRole => {
        const r = (rawRole || '').trim().toLowerCase();
        if (r.includes('owner') || r.includes('business')) return 'Business Owner';
        if (r.includes('sales')) return 'Sales Team';
        if (r.includes('prod') && r.includes('staff')) return 'Production Staff';
        if (r.includes('prod') && r.includes('team')) return 'Production Team';
        if (r.includes('op') && r.includes('staff')) return 'Operation Staff';
        if (r.includes('op') && r.includes('team')) return 'Operations Team';
        if (r.includes('editor') || r.includes('production')) return 'Production Staff';
        if (r.includes('photo') || r.includes('video') || r.includes('drone') || r.includes('operation')) return 'Operation Staff';
        return rawRole as UserRole;
      };

      const normalizedRole = normalizeUserRole(dbUser.role);
      const validRoles: UserRole[] = ['Business Owner', 'Sales Team', 'Operations Team', 'Production Team', 'Operation Staff', 'Production Staff'];
      if (!validRoles.includes(normalizedRole)) {
        const msg = 'You do not have permission to access this page.';
        logAttempt('Failed', msg, dbUser.id);
        return { success: false, error: msg };
      }

      dbUser.role = normalizedRole;

      // Load credentials & fields
      const foundUser = mapUserFieldsFromDb(dbUser);

      // Successful login
      setCurrentUser(foundUser);
      setCurrentRoleState(foundUser.role);
      setCurrentUserNameState(foundUser.name);

      // Save to local storage
      localStorage.setItem('erp_current_user', JSON.stringify(foundUser));
      localStorage.setItem('erp_role', foundUser.role);
      localStorage.setItem('erp_user_name', foundUser.name);
      localStorage.setItem('erp_session_token', `local_${Date.now()}`);

      // Log login
      const newLog: ActivityLog = {
        log_id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
        user_name: foundUser.name,
        role: foundUser.role,
        action: 'User Logged In Successfully',
        module: 'Session',
        record_id: foundUser.id,
        timestamp: new Date().toISOString(),
      };
      setLogs((prev) => [newLog, ...prev]);
      pushInsert('activity_logs', newLog);

      // Always fetch fresh data from Supabase when user logs in
      try {
        fetchFromDb(true).catch(e => console.warn("[LOGIN] fetchFromDb threw:", e?.message || e));
      } catch (e: any) {
        console.warn("[LOGIN] fetchFromDb threw:", e?.message || e);
      }
      
      logAttempt('Success', 'Login successful.', dbUser.id);
      console.log("[LOGIN] Login successful, returning true");
      return { success: true };

    } finally {
      isLoggingInRef.current = false;
    }
  };

  // Logout action
  const logout = () => {
    if (currentUser) {
      const newLog: ActivityLog = {
        log_id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
        user_name: currentUser.name,
        role: currentUser.role,
        action: 'User Logged Out',
        module: 'Session',
        record_id: currentUser.id,
        timestamp: new Date().toISOString(),
      };
      setLogs((prev) => [newLog, ...prev]);
      pushInsert('activity_logs', newLog);
    }
    setCurrentUser(null);
    setCurrentRoleState('Business Owner');
    setCurrentUserNameState('Rupand Das');
    localStorage.removeItem('erp_current_user');
    localStorage.removeItem('erp_role');
    localStorage.removeItem('erp_user_name');
    if (supabaseClient) {
      supabaseClient.auth.signOut()
        .then(() => {
          console.log("[LOGOUT] Supabase Auth signOut complete.");
        })
        .catch(err => console.warn('Supabase Auth signOut failed:', err));
    }
  };

  // Helper to add activity logs
  const logActivity = (
    action: string, 
    module: string, 
    recordId: string, 
    prevStage?: string, 
    newStage?: string
  ) => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    let detailedAction = action;
    if (prevStage || newStage) {
      detailedAction += ` | Previous Stage: ${prevStage || 'N/A'} | New Stage: ${newStage || 'N/A'}`;
    }
    detailedAction += ` | Date: ${dateStr} | Time: ${timeStr}`;

    const newLog: ActivityLog = {
      log_id: `LOG-${Math.floor(100 + Math.random() * 900)}`,
      user_name: currentUserName,
      role: currentRole,
      action: detailedAction,
      module,
      record_id: recordId,
      timestamp: now.toISOString(),
      previous_stage: prevStage,
      new_stage: newStage,
      date: dateStr,
      time: timeStr,
    };
    setLogs((prev) => [newLog, ...prev]);

    // Strip out non-database columns before sending to Supabase
    const dbRecord = {
      log_id: newLog.log_id,
      user_name: newLog.user_name,
      role: newLog.role,
      action: newLog.action,
      module: newLog.module,
      record_id: newLog.record_id,
      timestamp: newLog.timestamp,
    };
    pushInsert('activity_logs', dbRecord);
  };

  const resetAllData = () => {
    setUsers(INITIAL_USERS);
    setLeads(INITIAL_LEADS);
    setOrders(INITIAL_ORDERS);
    setOperations(INITIAL_OPERATIONS);
    setRawFootage(INITIAL_RAW_FOOTAGE);
    setProduction(INITIAL_PRODUCTION);
    setPayments(INITIAL_PAYMENTS);
    setLogs(INITIAL_LOGS);
    setCurrentUser(null);
    setCurrentRoleState('Business Owner');
    setCurrentUserNameState('Rupand Das');
    localStorage.removeItem('erp_current_user');

    if (supabaseClient) {
      INITIAL_USERS.forEach(u => pushUpsert('users', { ...u, id: mapToDbUserId(u.id) }));
      INITIAL_LEADS.forEach(l => pushUpsert('leads', l));
      INITIAL_ORDERS.forEach(o => pushUpsert('orders', o));
      INITIAL_OPERATIONS.forEach(op => pushUpsert('operations', op));
      INITIAL_RAW_FOOTAGE.forEach(rf => pushUpsert('raw_footage', rf));
      INITIAL_PRODUCTION.forEach(p => pushUpsert('production', p));
      INITIAL_PAYMENTS.forEach(pay => pushUpsert('payments', pay));
      INITIAL_LOGS.forEach(log => pushUpsert('activity_logs', log));
    }

    logActivity('Reset Database to Pre-seeded State', 'System', 'ALL');
  };

  const refreshData = async () => {
    await fetchFromDb();
    logActivity('Refreshed Workspace Data', 'System', 'ALL');
  };

  // 1. Create Lead
  const addLead = async (
    leadDetails: Omit<Lead, 'lead_id' | 'status' | 'created_by' | 'sales_person' | 'created_date'>,
    packages?: Omit<LeadPackage, 'lead_package_id' | 'lead_id'>[]
  ) => {
    // Verify logged-in user is authenticated
    if (supabaseClient) {
      const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
      const { data: userData, error: userErr } = await supabaseClient.auth.getUser();

      const session = sessionData?.session;
      const authUser = userData?.user;

      console.log('SESSION', session);
      console.log('USER', authUser);

      if (sessionErr || userErr) {
        console.warn("[addLead] Session or user check failed:", sessionErr || userErr);
      }

      // If BOTH session and authUser are null AND we don't have a currentUser in React state
      if (!session && !authUser && !currentUser) {
        throw new Error("Please login again.");
      }

      // Check if session is expired
      const isExpired = session?.expires_at ? (session.expires_at <= Math.floor(Date.now() / 1000)) : false;
      if (isExpired && !authUser) {
        throw new Error("Session expired.");
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
          console.warn("[addLead] Users table lookup failed:", dbUserErr.message);
        }
      }

      if (!dbUser && emailFromAuth) {
        const { data: dbUserByEmail } = await supabaseClient
          .from('users')
          .select('*')
          .ilike('email', emailFromAuth.trim())
          .maybeSingle();
        
        if (dbUserByEmail && currentUid) {
          await supabaseClient.from('users').update({ id: currentUid }).eq('email', dbUserByEmail.email);
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
          console.log("Aligning user profile email with authenticated email in context...");
          await supabaseClient
            .from('users')
            .update({ email: emailFromAuth.trim() })
            .eq('id', currentUid);
          dbUser = { ...dbUser, email: emailFromAuth.trim() };
        }
      }

      let finalUser = currentUser;
      if (dbUser) {
        finalUser = mapUserFieldsFromDb(dbUser);
      }

      if (!finalUser) {
        throw new Error("User record missing from users table.");
      }

      // Robust case-insensitive comparison and self-healing alignment
      if (emailFromAuth && finalUser.email) {
        const finalEmailNorm = finalUser.email.toLowerCase().trim();
        const authEmailNorm = emailFromAuth.toLowerCase().trim();
        if (finalEmailNorm !== authEmailNorm) {
          console.log("Healing email mismatch between local user record and auth in context...");
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
        throw new Error("User role not loaded correctly.");
      }

      if (!finalUser.active) {
        throw new Error("User account is deactivated.");
      }

      if (finalUser.role !== 'Sales Team' && finalUser.role !== 'Business Owner') {
        throw new Error("User does not have permission to create quotations.");
      }
    } else {
      if (!currentUser) {
        throw new Error("Please login again.");
      }
      if (currentUser.role !== 'Sales Team' && currentUser.role !== 'Business Owner') {
        throw new Error("User does not have permission to create quotations.");
      }
    }

    const existingLeadIds = new Set<string>();
    if (leads) {
      leads.forEach(ld => {
        if (ld.lead_id) existingLeadIds.add(ld.lead_id);
      });
    }

    if (supabaseClient) {
      try {
        const { data: dbLeads } = await supabaseClient.from('leads').select('lead_id');
        if (dbLeads) {
          dbLeads.forEach((ld: any) => {
            if (ld.lead_id) existingLeadIds.add(ld.lead_id);
          });
        }
      } catch (e) {
        console.warn("Error fetching lead_ids from DB for unique ID generation:", e);
      }
    }

    let maxLeadNum = 0;
    existingLeadIds.forEach(id => {
      const match = id.match(/^(?:LD|LD-|LEAD-?)?(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxLeadNum) {
          maxLeadNum = num;
        }
      }
    });
    let nextLeadNum = maxLeadNum + 1;

    while (
      existingLeadIds.has(`LD${String(nextLeadNum).padStart(3, '0')}`) ||
      existingLeadIds.has(`LD-${String(nextLeadNum).padStart(3, '0')}`) ||
      existingLeadIds.has(`LD${nextLeadNum}`)
    ) {
      nextLeadNum++;
    }
    let leadId = `LD${String(nextLeadNum).padStart(3, '0')}`;

    // We still keep notes_special_customizations plain without serialized events, 
    // or we can keep it as is for backward compatibility but save events to table anyway
    const serializedNotes = leadDetails.notes_special_customizations || '';
    let newLead: Lead = {
      ...leadDetails,
      email: leadDetails.email || '',
      lead_id: leadId,
      created_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
      sales_person: currentUserName,
      sales_staff_id: currentUser?.id || '',
      status: (leadDetails as any).status || 'Create Quote',
      created_by: currentUserName,
      total_pax: leadDetails.total_pax !== undefined ? Number(leadDetails.total_pax) : 0,
      reference_source: leadDetails.reference_source || '',
      notes_special_customizations: serializedNotes
    };
    
    // Strip events property to prevent DB schema errors
    delete (newLead as any).events;
    
    console.log('Lead Payload', newLead);
    let res = await pushInsert('leads', newLead);

    // Concurrency safety retry loop: if duplicate lead_id error occurs, re-increment and retry
    let retryAttempt = 0;
    while (!res?.success && res?.error && (res.error.includes('duplicate key') || res.error.includes('already exists') || res.error.includes('unique')) && retryAttempt < 5) {
      retryAttempt++;
      nextLeadNum++;
      leadId = `LD${String(nextLeadNum).padStart(3, '0')}`;
      newLead.lead_id = leadId;
      console.log(`[addLead] Retry attempt ${retryAttempt} with new leadId: ${leadId}`);
      res = await pushInsert('leads', newLead);
    }

    console.log('Lead Insert Result', res?.success ? 'success' : 'fail');
    console.log('Lead Insert Error', res?.error || null);
    
    if (!res?.success) {
      throw new Error(res?.error || "Failed to save lead in database.");
    }

    if (leadDetails.events && leadDetails.events.length > 0) {
      for (const ev of leadDetails.events) {
        const { id, ...eventWithoutId } = ev;
        const newEventRecord = {
          lead_id: leadId,
          event_type: ev.event_type || '',
          event_name: ev.event_name || '',
          event_shoot_type: ev.event_shoot_type || '',
          event_date: ev.event_date || '',
          event_start_time: ev.event_start_time || '',
          event_end_time: ev.event_end_time || '',
          event_location: ev.event_location || '',
          google_maps_link: ev.google_maps_link || '',
          guest_pax: String(ev.guest_pax) !== '' && ev.guest_pax != null ? Number(ev.guest_pax) : null,
          staff_pax: String(ev.staff_pax) !== '' && ev.staff_pax != null ? Number(ev.staff_pax) : null,
          assigned_staff_names: ev.assigned_staff_names || '',
          assigned_staff_mobiles: ev.assigned_staff_mobiles || ''
        };
        const evRes = await pushInsert('lead_events', newEventRecord);
        if (!evRes?.success) {
          throw new Error(`Failed to save event to lead_events table: ${evRes?.error || "Unknown error"}`);
        }
      }
    }

    if (packages && packages.length > 0) {
      const formattedPackages: LeadPackage[] = packages.map((pkg, index) => ({
        ...pkg,
        lead_package_id: `LP-${leadId}-${index}-${Math.floor(100 + Math.random() * 900)}`,
        lead_id: leadId,
        created_at: new Date().toISOString()
      }));
      for (const p of formattedPackages) {
        await pushInsert('lead_packages', p);
      }
    }

    //  // Disabled to prevent full reload

    addNotification({
      user_id: 'All',
      project_id: leadId,
      task_id: 'New Lead Inflow',
      notification_type: 'New Lead Created',
      title: '🆕 New Lead Created',
      message: `A new Lead (${leadId}) has been created for ${newLead.customer_name}. Reference Source: ${newLead.reference_source || 'Direct'}.`,
      recipient_role: 'Business Owner'
    });

    logActivity(`Created Lead: ${newLead.customer_name}`, 'Sales', leadId, 'N/A', 'New Lead');
    
    setLeads((prev) => {
      // Avoid duplicate insert if already exists
      if (prev.some(l => l.lead_id === leadId)) return prev;
      return [newLead, ...prev];
    });

    return leadId;
  };

    const saveLeadPackages = async (
    leadId: string,
    packagesSelected: Omit<LeadPackage, 'lead_package_id' | 'lead_id'>[]
  ) => {
    const existing = leadPackages.filter(lp => lp.lead_id === leadId);
    const targetLead = leads.find(l => l.lead_id === leadId);
    const leadEventsList = targetLead?.events || [];

    if (packagesSelected && packagesSelected.length > 0) {
      const newPkgIds = new Set(packagesSelected.map(p => p.package_id));

      for (const ex of existing) {
        if (!newPkgIds.has(ex.package_id)) {
          await pushDelete('lead_packages', 'lead_package_id', ex.lead_package_id);
        }
      }

      for (const [index, pkg] of packagesSelected.entries()) {
        const existingPkg = existing.find(ex => ex.package_id === pkg.package_id);
        
        const edInclusions = pkg.editable_inclusions || (existingPkg ? existingPkg.editable_inclusions : undefined);
        const edDeliverables = pkg.editable_deliverables || (existingPkg ? existingPkg.editable_deliverables : undefined);

        let teamMembersJson = pkg.Team_Members_Included || (existingPkg ? existingPkg.Team_Members_Included : null);
        let deliverablesJson = pkg.deliverables_descriptionn || (existingPkg ? existingPkg.deliverables_descriptionn : null);

        if (!teamMembersJson && edInclusions) {
          teamMembersJson = (leadEventsList && leadEventsList.length > 0)
            ? leadEventsList.map(event => {
                const evId = String(event.id || event.event_id || '');
                const eventKey = `${pkg.package_id}_${evId}`;
                const list = edInclusions[eventKey] !== undefined
                  ? edInclusions[eventKey]
                  : (edInclusions[evId] !== undefined
                      ? edInclusions[evId]
                      : (leadEventsList.length === 1 ? (edInclusions[pkg.package_id] || []) : []));
                return {
                  event_id: evId,
                  event_name: event.event_name || event.event_type || 'Unnamed Event',
                  team_members: list.filter(Boolean)
                };
              })
            : [
                {
                  event_id: 'default',
                  event_name: "General",
                  team_members: (edInclusions[pkg.package_id] || []).filter(Boolean)
                }
              ];
        }

        if (!deliverablesJson && edDeliverables) {
          deliverablesJson = (leadEventsList && leadEventsList.length > 0)
            ? leadEventsList.map(event => {
                const evId = String(event.id || event.event_id || '');
                const eventKey = `${pkg.package_id}_${evId}`;
                const list = edDeliverables[eventKey] !== undefined
                  ? edDeliverables[eventKey]
                  : (edDeliverables[evId] !== undefined
                      ? edDeliverables[evId]
                      : (leadEventsList.length === 1 ? (edDeliverables[pkg.package_id] || []) : []));
                return {
                  event_id: evId,
                  event_name: event.event_name || event.event_type || 'Unnamed Event',
                  deliverables: list.filter(Boolean)
                };
              })
            : [
                {
                  event_id: 'default',
                  event_name: "General",
                  deliverables: (edDeliverables[pkg.package_id] || []).filter(Boolean)
                }
              ];
        }

        const updatedPkgData = {
          ...pkg,
          ...(teamMembersJson ? { Team_Members_Included: teamMembersJson } : {}),
          ...(deliverablesJson ? { deliverables_descriptionn: deliverablesJson } : {})
        };

        console.log(`[RoleContext saveLeadPackages] Package payload for 'lead_packages':`, {
          leadId,
          packageId: pkg.package_id,
          Team_Members_Included: updatedPkgData.Team_Members_Included,
          deliverables_descriptionn: updatedPkgData.deliverables_descriptionn,
          isTeamArray: Array.isArray(updatedPkgData.Team_Members_Included),
          isDelArray: Array.isArray(updatedPkgData.deliverables_descriptionn)
        });

        if (existingPkg) {
          await pushUpdate('lead_packages', 'lead_package_id', existingPkg.lead_package_id, {
            ...updatedPkgData
          });
        } else {
          await pushInsert('lead_packages', {
            ...updatedPkgData,
            lead_package_id: `LP-${leadId}-${pkg.package_id}`,
            lead_id: leadId,
            created_at: new Date().toISOString()
          } as LeadPackage);
        }
      }
    } else {
      await pushDelete('lead_packages', 'lead_id', leadId);
    }
  };

  // 2. Lead Follow-Up (Screen 3)
  const updateLeadFollowUp = async (
    leadId: string, 
    status: CurrentStage, 
    callNotes: string, 
    nextFollowUpDate: string, 
    quotationAmount?: number, 
    negotiationNotes?: string
  ) => {
    if (!leadId || typeof leadId !== 'string' || leadId.trim() === '') {
      throw new Error('lead_id is missing or invalid.');
    }

    const targetLead = leads.find((ld) => ld.lead_id === leadId);
    if (!targetLead) {
      throw new Error(`Lead record with ID "${leadId}" was not found in local cache.`);
    }

    const previousStage = targetLead ? (targetLead.current_status || targetLead.status || 'New Lead') : 'New Lead';
    const timestamp = new Date().toISOString();

    // Normalize different spellings of Follow Up to prevent fragmented sources of truth
    const normalizedStatus = (status as string === 'Follow-up' || status as string === 'Follow-Up' || status === 'Follow Up') ? 'Follow Up' : status;

    const updatesPayload: any = {
      status: normalizedStatus,
      current_status: normalizedStatus,
      budget: quotationAmount !== undefined ? quotationAmount : targetLead?.budget,
      remarks: `${targetLead?.remarks || ''}\n[Update ${timestamp.split('T')[0]}]: ${callNotes}. ${negotiationNotes ? 'Neg Notes: ' + negotiationNotes : ''}. Next follow-up: ${nextFollowUpDate}`,
      updated_by: currentUserName,
      updated_at: timestamp
    };
    
    updatesPayload.follow_up_notes = callNotes || null;
    updatesPayload.next_follow_up_date = nextFollowUpDate || null;
    
    // Extract time tag if present in callNotes
    const timeMatch = (callNotes || '').match(/\[Time:\s*([0-9]{1,2}:[0-9]{2}(?:\s*[AP]M)?)\]/i);
    if (timeMatch) {
      updatesPayload.next_follow_up_time = timeMatch[1].trim();
    }
    
    if (normalizedStatus === 'Lost Lead') {
      const reasonVal = callNotes || '';
      const notesVal = negotiationNotes || '';
      updatesPayload["Lost_Reason"] = reasonVal;
      updatesPayload["lost_reason"] = reasonVal;
      updatesPayload["Lost_Notes"] = notesVal;
      updatesPayload["lost_notes"] = notesVal;
    }

    const res = await pushUpdate('leads', 'lead_id', leadId, updatesPayload);

    if (!res?.success) {
      throw new Error(res?.error || "Failed to save follow-up details in database.");
    }

    if (normalizedStatus !== previousStage) {
      const linkedOrder = orders.find(o => o.lead_id === leadId);
      const orderId = linkedOrder?.order_id || null;

      if (normalizedStatus === 'Order Confirmed' && !orderId) {
        throw new Error(`"order_id" is required for "Order Confirmed" status, but it was not found or is missing.`);
      }
      
      const roleParts = (currentUserName && currentUserName.includes('|')) 
        ? currentUserName.split('|') 
        : [currentUserName || 'System', currentRole || 'System'];
      const changedBy = roleParts[0];
      const changedByRole = roleParts[1] || currentRole || 'System';

      const newHist = {
        lead_id: leadId,
        order_id: orderId,
        old_status: previousStage,
        new_status: normalizedStatus,
        changed_by: changedBy,
        changed_by_role: changedByRole,
        remarks: callNotes || 'Status updated from CRM follow-up panel',
        created_at: timestamp
      };

      const resHist = await pushInsert('lead_status_history', newHist);
      if (!resHist?.success) {
        throw new Error(`"lead_status_history" insert failed. Error: ${resHist?.error || "Unknown error"}`);
      }
      setStatusHistory(prev => [...prev, newHist]);
    }

    setLeads((prev) => 
      prev.map((ld) => {
        if (ld.lead_id === leadId) {
          const updatedLd = {
            ...ld,
            status: normalizedStatus,
            current_status: normalizedStatus,
            budget: quotationAmount !== undefined ? quotationAmount : ld.budget,
            remarks: `${ld.remarks || ''}\n[Update ${timestamp.split('T')[0]}]: ${callNotes}. ${negotiationNotes ? 'Neg Notes: ' + negotiationNotes : ''}. Next follow-up: ${nextFollowUpDate}`,
            follow_up_notes: callNotes || undefined,
            next_follow_up_date: nextFollowUpDate || undefined,
            updated_by: currentUserName,
            updated_at: timestamp
          };
          if (normalizedStatus === 'Lost Lead') {
             const reasonVal = callNotes || '';
             const notesVal = negotiationNotes || '';
             (updatedLd as any).Lost_Reason = reasonVal;
             (updatedLd as any).lost_reason = reasonVal;
             (updatedLd as any).Lost_Notes = notesVal;
             (updatedLd as any).lost_notes = notesVal;
          }
          return updatedLd;
        }
        return ld;
      })
    );

    
    logActivity(`Updated Lead Follow-up, stage: ${status}`, 'Sales', leadId, previousStage, status);
  };

  // 3. Confirm Order (Action button)
  const confirmOrder = async (
    leadId: string, 
    packageName: string, 
    quotationAmount: number, 
    advanceReceived: number,
    eventDate?: string,
    eventTime?: string,
    paymentMode?: string,
    notes?: string,
    reportingTime?: string,
    transactionId?: string
  ) => {
    if (!leadId || typeof leadId !== 'string' || leadId.trim() === '') {
      throw new Error('lead_id is missing or invalid.');
    }

    const targetLead = leads.find((ld) => ld.lead_id === leadId);
    if (!targetLead) {
      throw new Error(`Lead record with ID "${leadId}" was not found in local cache.`);
    }

    const cleanTxnId = (transactionId && typeof transactionId === 'string' && transactionId.trim() !== '' && transactionId.trim() !== 'N/A' && transactionId.trim() !== 'null' && transactionId.trim() !== 'NULL') ? transactionId.trim() : null;
    const resolvedRemarks = `${targetLead.remarks || ''}\n[Booking Confirmed Update ${new Date().toISOString().split('T')[0]}]: ${notes || 'No extra notes'}. Payment Mode: ${paymentMode || 'N/A'}`;
    const timestamp = new Date().toISOString();

    const resLead = await pushUpdate('leads', 'lead_id', leadId, { 
      status: 'Order Confirmed', 
      current_status: 'Order Confirmed', 
      booking_status: 'Confirmed',
      quotation_locked: true,
      booking_date: new Date().toISOString().split('T')[0],
      booking_time: new Date().toLocaleTimeString(),
      package_name: packageName,
      Final_Package_Amount: quotationAmount,
      final_package_amount: quotationAmount,
      Final_Quotation_Amount: quotationAmount,
      advance_collected: advanceReceived,
      payment_mode: paymentMode || 'N/A',
      transaction_id: cleanTxnId || undefined,
      contract_notes: notes || 'No extra notes',
      event_date: eventDate || targetLead.event_date,
      event_time: eventTime || targetLead.event_time,
      reporting_time: reportingTime || targetLead.reporting_time,
      remarks: resolvedRemarks,
      updated_by: currentUserName, 
      updated_at: timestamp
    });

    if (!resLead?.success) {
      throw new Error(resLead?.error || "Failed to update lead during order confirmation.");
    }

    // Step 3: Check Supabase directly for existing order
    let masterOrderId = '';
    let nextOrderNum = 1;
    let existingOrder = augmentedOrders.find(o => o.lead_id === leadId);
    let orderExistsInDb = false;

    if (supabaseClient) {
      const { data: dbOrder, error } = await supabaseClient.from('orders').select('*').eq('lead_id', leadId).maybeSingle();
      if (dbOrder) {
        masterOrderId = dbOrder.order_id;
        orderExistsInDb = true;
      }
    }

    if (!masterOrderId) {
      if (existingOrder && existingOrder.order_id) {
        masterOrderId = existingOrder.order_id;
      } else {
        // Generate a new Order ID starting with OR001
        nextOrderNum = 1;
        const existingOrderIds = new Set<string>();
        orders.forEach(o => { if (o.order_id) existingOrderIds.add(o.order_id); });
        augmentedOrders.forEach(o => { if (o.order_id) existingOrderIds.add(o.order_id); });

        if (supabaseClient) {
          try {
            // Fetch order IDs to prevent collisions
            const { data: dbOrders } = await supabaseClient.from('orders').select('order_id');
            if (dbOrders) {
              dbOrders.forEach((o: any) => { if (o.order_id) existingOrderIds.add(o.order_id); });
            }
          } catch (e) {
            console.warn("Error fetching order_ids from DB for unique ID generation:", e);
          }
        }

        let maxOrderNum = 0;
        existingOrderIds.forEach(id => {
          const match = id.match(/^(?:OR|ORD|OR-|\bORDER-?)?(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxOrderNum) {
              maxOrderNum = num;
            }
          }
        });
        nextOrderNum = maxOrderNum + 1;

        while (
          existingOrderIds.has(`OR${String(nextOrderNum).padStart(3, '0')}`) ||
          existingOrderIds.has(`OR-${String(nextOrderNum).padStart(3, '0')}`) ||
          existingOrderIds.has(`ORD-${String(nextOrderNum).padStart(3, '0')}`) ||
          existingOrderIds.has(`OR${nextOrderNum}`)
        ) {
          nextOrderNum++;
        }
        masterOrderId = `OR${String(nextOrderNum).padStart(3, '0')}`;
      }
    }

    if (!masterOrderId) {
      throw new Error(`"order_id" could not be generated or found for Order Confirmation.`);
    }
    
    if (orderExistsInDb) {
      const rOrd = await pushUpdate('orders', 'order_id', masterOrderId, {
        customer_name: targetLead.customer_name,
        mobile: targetLead.mobile,
        event_type: targetLead.event_type,
        custom_event_name: targetLead.custom_event_name || '',
        custom_event_type: targetLead.custom_event_type || '',
        event_date: eventDate || targetLead.event_date || undefined,
        event_time: eventTime || targetLead.event_time || undefined,
        reporting_time: reportingTime || targetLead.reporting_time || undefined,
        event_location: targetLead.event_location,
        package_name: packageName,
        quotation_amount: quotationAmount,
        advance_received: 0,
        balance_amount: quotationAmount,
        order_status: 'Confirmed',
        current_stage: 'Order Confirmed',
        sales_person: currentUserName,
        updated_by: currentUserName,
        updated_at: timestamp,
        client_residence_address: targetLead.client_residence_address || '',
        city: targetLead.city || '',
        state: targetLead.state || '',
        pincode: targetLead.pincode || '',
        desired_event_shoot_type: targetLead.desired_event_shoot_type || '',
        package_price: quotationAmount,
        deliverables_description: targetLead.deliverables_description || '',
        notes_special_customizations: targetLead.notes_special_customizations || '',
        quotation_discount: targetLead.quotation_discount || 0,
        additional_services_cost: targetLead.additional_services_cost || 0,
      });
      if (!rOrd?.success) throw new Error("Failed to update existing order: " + rOrd?.error);
      setOrders(prev => prev.map(o => o.order_id === masterOrderId ? {
        ...o,
        customer_name: targetLead.customer_name,
        mobile: targetLead.mobile,
        event_type: targetLead.event_type,
        event_date: eventDate || targetLead.event_date || o.event_date,
        event_time: eventTime || targetLead.event_time || o.event_time,
        reporting_time: reportingTime || targetLead.reporting_time || o.reporting_time,
        event_location: targetLead.event_location,
        package_name: packageName,
        quotation_amount: quotationAmount,
        order_status: 'Confirmed',
        current_stage: 'Order Confirmed',
        updated_at: timestamp
      } : o));
    } else {
      const newOrder: Order = {
        order_id: masterOrderId,
        lead_id: leadId,
        customer_name: targetLead.customer_name,
        mobile: targetLead.mobile,
        event_type: targetLead.event_type,
        custom_event_name: targetLead.custom_event_name || '',
        custom_event_type: targetLead.custom_event_type || '',
        shoot_type: targetLead.shoot_type || '',
        event_date: eventDate || targetLead.event_date || undefined,
        event_time: eventTime || targetLead.event_time || undefined,
        reporting_time: reportingTime || targetLead.reporting_time || undefined,
        event_location: targetLead.event_location,
        package_name: packageName,
        quotation_amount: quotationAmount,
        advance_received: 0,
        balance_amount: quotationAmount,
        order_status: 'Confirmed',
        current_stage: 'Order Confirmed',
        sales_person: currentUserName,
        created_at: timestamp,
        updated_by: currentUserName,
        updated_at: timestamp,
        whatsapp_number: targetLead.whatsapp_number || undefined,
        address: targetLead.address || '',
        city: targetLead.city || '',
        state: targetLead.state || '',
        pincode: targetLead.pincode || '',
        client_residence_address: targetLead.client_residence_address || '',
        desired_event_shoot_type: targetLead.desired_event_shoot_type || '',
        package_price: quotationAmount,
        deliverables_description: targetLead.deliverables_description || '',
        notes_special_customizations: targetLead.notes_special_customizations || '',
        quotation_discount: targetLead.quotation_discount || 0,
        additional_services_cost: targetLead.additional_services_cost || 0,
      };
      let rOrd = await pushInsert('orders', newOrder);
      let orderRetry = 0;
      while (!rOrd?.success && rOrd?.error && (rOrd.error.includes('duplicate key') || rOrd.error.includes('already exists') || rOrd.error.includes('unique')) && orderRetry < 5) {
        orderRetry++;
        nextOrderNum++;
        masterOrderId = `OR${String(nextOrderNum).padStart(3, '0')}`;
        newOrder.order_id = masterOrderId;
        console.log(`[confirmOrder] Retry attempt ${orderRetry} with new masterOrderId: ${masterOrderId}`);
        rOrd = await pushInsert('orders', newOrder);
      }
      if (!rOrd?.success) throw new Error("Failed to insert Order: " + rOrd?.error);
      setOrders(prev => {
        const filtered = prev.filter(o => o.order_id !== masterOrderId);
        return [newOrder, ...filtered];
      });
    }

    // Payments
    let paymentExistsInDb = false;
    let existingPaymentId = payments.find(p => p.order_id === masterOrderId)?.payment_id;

    if (supabaseClient) {
      const { data: dbPayment } = await supabaseClient.from('payments').select('payment_id').eq('order_id', masterOrderId).maybeSingle();
      if (dbPayment) {
        existingPaymentId = dbPayment.payment_id;
        paymentExistsInDb = true;
      }
    }

    if (!paymentExistsInDb) {
      const paymentId = existingPaymentId || `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
      const hasAdvance = advanceReceived > 0;
      const initialPaymentStatus: PaymentStatus = hasAdvance ? 'Waiting for Approval' : 'Pending';
      const newPayment: Payment = {
        payment_id: paymentId,
        order_id: masterOrderId,
        quotation_amount: quotationAmount,
        advance_received: 0,
        balance_due: quotationAmount,
        final_payment_received: 0,
        payment_date: new Date().toISOString().split('T')[0],
        payment_proof_url: undefined,
        payment_status: initialPaymentStatus,
        transaction_id: cleanTxnId || undefined,
        Payment_type: 'Advance Payment',
        payment_type: 'Advance Payment',
      };
      const rPay = await pushInsert('payments', newPayment);
      if (!rPay?.success) throw new Error("Failed to insert Payment: " + rPay?.error);

      setPayments(prev => {
        const exists = prev.some(p => p.payment_id === paymentId);
        if (exists) {
          return prev.map(p => p.payment_id === paymentId ? { ...p, ...newPayment } : p);
        }
        return [...prev, newPayment];
      });
    } else if (existingPaymentId) {
      const hasAdvance = advanceReceived > 0;
      const initialPaymentStatus: PaymentStatus = hasAdvance ? 'Waiting for Approval' : 'Pending';
      const updatedPaymentPayload = {
        quotation_amount: quotationAmount,
        advance_received: 0,
        balance_due: quotationAmount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_status: initialPaymentStatus,
        transaction_id: cleanTxnId || undefined,
        Payment_type: 'Advance Payment',
        payment_type: 'Advance Payment'
      };
      const rPay = await pushUpdate('payments', 'payment_id', existingPaymentId, updatedPaymentPayload);
      if (!rPay?.success) throw new Error("Failed to update Payment: " + rPay?.error);

      setPayments(prev => prev.map(p => p.payment_id === existingPaymentId ? { ...p, ...updatedPaymentPayload } : p));
    }

    // Persist advance payment in payment history with Waiting for Approval
    if (advanceReceived > 0) {
      const newHistId = generateUUID();
      const newHistoryItem = {
        id: newHistId,
        order_id: masterOrderId,
        amount: advanceReceived,
        payment_date: new Date().toISOString(),
        transaction_id: cleanTxnId || null,
        payment_mode: paymentMode || 'UPI',
        payment_type: 'Advance Payment',
        updated_by: currentUserName || 'Sales',
        notes: (notes && notes.trim() ? notes.trim() + ' - ' : '') + 'Initial advance payment on order confirmation - Waiting for Approval',
        approval_status: 'Waiting for Approval'
      };

      const resHist = await pushInsert('payment_history', newHistoryItem);
      if (!resHist?.success && supabaseClient) {
        await supabaseClient.from('payment_history').upsert(newHistoryItem, { onConflict: 'id' });
      }

      // Verify in Supabase
      if (supabaseClient) {
        const { data: verifiedHist, error: vErr } = await supabaseClient
          .from('payment_history')
          .select('*')
          .eq('id', newHistId)
          .maybeSingle();
        if (!verifiedHist || vErr) {
          await supabaseClient.from('payment_history').upsert(newHistoryItem, { onConflict: 'id' });
        }
        const { data: freshHistory } = await supabaseClient
          .from('payment_history')
          .select('*')
          .order('payment_date', { ascending: false });
        if (freshHistory && Array.isArray(freshHistory)) {
          setPaymentHistory(freshHistory);
        } else {
          setPaymentHistory(prev => [newHistoryItem, ...prev]);
        }
      } else {
        setPaymentHistory(prev => [newHistoryItem, ...prev]);
      }

      try {
        const saved = localStorage.getItem('pending_payment_approvals');
        const parsed = saved ? JSON.parse(saved) : [];
        const filtered = (Array.isArray(parsed) ? parsed : []).filter((p: any) => p.id !== newHistId);
        filtered.unshift(newHistoryItem);
        localStorage.setItem('pending_payment_approvals', JSON.stringify(filtered));
      } catch (_) {}
    }

    // Operations
    let opExistsInDb = false;
    let existingOpId = operations.find(o => o.order_id === masterOrderId)?.operation_id;

    if (supabaseClient) {
      const { data: dbOp } = await supabaseClient.from('operations').select('operation_id').eq('order_id', masterOrderId).maybeSingle();
      if (dbOp) {
        existingOpId = dbOp.operation_id;
        opExistsInDb = true;
      }
    }

    if (!opExistsInDb) {
      const newOp: Operation = {
        operation_id: existingOpId || `OP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`,
        order_id: masterOrderId,
        photographer_assigned: 'Unassigned',
        videographer_assigned: 'Unassigned',
        drone_operator_assigned: 'Unassigned',
        assistant_assigned: 'Unassigned',
        equipment_kit: '',
        reporting_time: reportingTime || '08:00',
        event_status: 'Operations Assigned',
        remarks: notes || '',
        updated_by: currentUserName,
      };
      const rOp = await pushInsert('operations', newOp);
      if (!rOp?.success) throw new Error("Failed to insert Operations: " + rOp?.error);
    } else if (existingOpId) {
      const rOp = await pushUpdate('operations', 'operation_id', existingOpId, {
        reporting_time: reportingTime || '08:00',
        remarks: notes || '',
        updated_by: currentUserName,
      });
      if (!rOp?.success) throw new Error("Failed to update Operations: " + rOp?.error);
    }

    // Insert into lead_status_history
    const oldStatus = targetLead.current_status || targetLead.status || 'New Lead';
    if ('Order Confirmed' !== oldStatus) {
      const roleParts = (currentUserName && currentUserName.includes('|')) 
        ? currentUserName.split('|') 
        : [currentUserName || 'System', currentRole || 'System'];
      const changedBy = roleParts[0];
      const changedByRole = roleParts[1] || currentRole || 'System';

      const newHist = {
        lead_id: leadId,
        order_id: masterOrderId,
        old_status: oldStatus,
        new_status: 'Order Confirmed',
        changed_by: changedBy,
        changed_by_role: changedByRole,
        remarks: notes || 'Order Confirmed & transitioned to Operations',
        created_at: timestamp
      };

      const resHist = await pushInsert('lead_status_history', newHist);
      if (!resHist?.success) {
        throw new Error(`"lead_status_history" insert failed. Error: ${resHist?.error || "Unknown error"}`);
      }
      setStatusHistory(prev => [...prev, newHist]);
    }

    addNotification({
      user_id: 'All',
      project_id: masterOrderId,
      task_id: 'Operations Allocation',
      notification_type: 'New Lead Assigned',
      title: 'New Order Received from Sales',
      message: `A new order (${masterOrderId}) has been confirmed for ${targetLead.customer_name}. Package: ${packageName}. Please assign crew and schedule the event!`,
      recipient_role: 'Operations Team'
    });

    setLeads((prev) => 
      prev.map((ld) => {
        if (ld.lead_id === leadId) {
          return {
            ...ld,
            status: 'Order Confirmed',
            current_status: 'Order Confirmed',
            quotation_locked: true,
            event_date: eventDate || ld.event_date,
            event_time: eventTime || ld.event_time,
            reporting_time: reportingTime || ld.reporting_time,
            remarks: resolvedRemarks,
            updated_by: currentUserName,
            updated_at: timestamp
          };
        }
        return ld;
      })
    );

    

    logActivity(`Confirmed Order for ${targetLead.customer_name}. Package: ${packageName}`, 'Sales', masterOrderId, targetLead.status, 'Order Confirmed');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('order-confirmed', { detail: { orderId: masterOrderId } }));
      window.dispatchEvent(new CustomEvent('order-updated', { detail: { orderId: masterOrderId } }));
      window.dispatchEvent(new CustomEvent('refresh-pending-payments', { detail: { orderId: masterOrderId } }));
    }
    // Background fetch to guarantee all relational records sync
    fetchFromDb(false).catch(() => {});

    return masterOrderId;
  };

  // 4. Assign Operations
  const assignOperations = async (
    orderId: string, 
    opData: {
      photographer_assigned: string;
      videographer_assigned: string;
      drone_operator_assigned: string;
      assistant_assigned: string;
      equipment_kit: string;
      reporting_time: string;
      remarks?: string;
      current_stage?: CurrentStage;
      event_date?: string;
      event_time?: string;
      event_status?: string;
    }
  ) => {
    const targetOrder = augmentedOrders.find((o) => o.order_id === orderId);
    if (!targetOrder) throw new Error("Order not found");

    let opExistsInDb = false;
    let existingOpId = operations.find(o => o.order_id === orderId)?.operation_id;

    if (supabaseClient) {
      const { data: dbOp } = await supabaseClient.from('operations').select('operation_id').eq('order_id', orderId).maybeSingle();
      if (dbOp) {
        existingOpId = dbOp.operation_id;
        opExistsInDb = true;
      }
    }

    const opId = existingOpId || `OP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
    const { current_stage, event_date, event_time, event_status, ...restOpData } = opData;
    
    // Default or specified status / stage
    const targetStatus = event_status || 'Event Scheduled';
    const targetStageNum: CurrentStage = current_stage || 'Event Scheduled';

    // Step 2 & 4: Only allow exact workflow statuses, throw custom error on spelling variations
    const allowedWorkflowStatuses = [
      'Confirm Order',
      'Order Confirmed',
      'New Order Received',
      'Operations Assigned',
      'Assigned Crew',
      'Staff Assigned',
      'Event Scheduled',
      'Event Started',
      'Event Completed',
      'Event Ended',
      'Footage Handover',
      'Verified Footage',
      'Footage Handover Verified',
      'Event Cancelled',
      'Raw Footage Received',
      'Assigned',
      'Completed'
    ];
    if (!allowedWorkflowStatuses.includes(targetStatus)) {
      throw new Error(`Invalid event status being sent to database.`);
    }

    // Map event_status to match DB constraint: CHECK (event_status IN ('Assigned', 'Completed'))
    let dbEventStatus = 'Assigned';
    if (
      targetStatus === 'Completed' || 
      targetStatus === 'Event Completed' || 
      targetStatus === 'Event Ended' ||
      targetStatus === 'Footage Handover' ||
      targetStatus === 'Verified Footage' ||
      targetStatus === 'Footage Handover Verified' ||
      targetStatus === 'Raw Footage Received'
    ) {
      dbEventStatus = 'Completed';
    } else {
      dbEventStatus = 'Assigned';
    }

    const newOp: Operation = {
      operation_id: opId,
      order_id: orderId,
      ...restOpData,
      event_status: dbEventStatus,
      updated_by: currentUserName,
    };

    const previousStage = targetOrder ? targetOrder.current_stage : 'Order Confirmed';
    const timestamp = new Date().toISOString();

    const roleParts = (currentUserName && currentUserName.includes('|')) 
      ? currentUserName.split('|') 
      : [currentUserName || 'System', currentRole || 'System'];
    const changedBy = roleParts[0];
    const changedByRole = roleParts[1] || currentRole || 'System';

    // Optimistic UI updates for immediate responsiveness
    setOrders(prev => prev.map(o => o.order_id === orderId ? {
      ...o,
      current_stage: targetStageNum,
      event_date: event_date || o.event_date,
      event_time: event_time || o.event_time,
      updated_by: currentUserName,
      updated_at: timestamp
    } : o));

    if (targetOrder) {
      setLeads(prev => prev.map(l => l.lead_id === targetOrder.lead_id ? {
        ...l,
        status: targetStageNum,
        current_status: targetStageNum,
        event_date: event_date || targetOrder.event_date,
        event_time: event_time || targetOrder.event_time,
        assigned_staff: (opData as any).assigned_staff,
        assigned_roles: (opData as any).assigned_roles,
        assigned_equipment: opData.equipment_kit,
        reporting_time: opData.reporting_time,
        updated_by: currentUserName,
        updated_at: timestamp
      } : l));
    }

    if (opExistsInDb || existingOpId) {
      setOperations(prev => prev.map(o => o.operation_id === existingOpId ? {
        ...o,
        ...restOpData,
        event_status: dbEventStatus,
        updated_by: currentUserName
      } : o));
    } else {
      setOperations(prev => [newOp, ...prev]);
    }

    const opPromises: Promise<any>[] = [];

    opPromises.push(
      pushUpdate('orders', 'order_id', orderId, { 
        current_stage: targetStageNum,
        event_date: event_date || (targetOrder ? targetOrder.event_date : undefined),
        event_time: event_time || (targetOrder ? targetOrder.event_time : undefined),
        updated_by: currentUserName,
        updated_at: timestamp
      }).then(resOrd => {
        if (!resOrd?.success) throw new Error(resOrd?.error || "Failed to update order status.");
      })
    );

    if (targetOrder) {
      opPromises.push(
        pushUpdate('leads', 'lead_id', targetOrder.lead_id, { 
          status: targetStageNum,
          current_status: targetStageNum,
          event_date: event_date || targetOrder.event_date,
          event_time: event_time || targetOrder.event_time,
          assigned_staff: (opData as any).assigned_staff,
          assigned_roles: (opData as any).assigned_roles,
          assigned_equipment: opData.equipment_kit,
          reporting_time: opData.reporting_time,
          updated_by: currentUserName,
          updated_at: timestamp
        }).then(resLead => {
          if (!resLead?.success) throw new Error(resLead?.error || "Failed to update lead status.");
        })
      );
    }

    if (opExistsInDb || existingOpId) {
      opPromises.push(
        pushUpdate('operations', 'operation_id', existingOpId as string, {
          ...restOpData,
          event_status: dbEventStatus,
          updated_by: currentUserName,
        }).then(resOp => {
          if (!resOp?.success) throw new Error(resOp?.error || "Failed to update operations.");
        })
      );
    } else {
      opPromises.push(
        pushInsert('operations', newOp).then(resOp => {
          if (!resOp?.success) throw new Error(resOp?.error || "Failed to insert operations.");
        })
      );
    }

    // Insert into lead_status_history if stage changed
    if (previousStage !== targetStageNum && targetOrder?.lead_id) {
      const newHist = {
        lead_id: targetOrder.lead_id,
        order_id: orderId,
        old_status: previousStage,
        new_status: targetStageNum,
        changed_by: changedBy,
        changed_by_role: changedByRole,
        remarks: opData.remarks || `Status updated to ${targetStageNum}`,
        created_at: timestamp
      };

      setStatusHistory(prev => [...prev, newHist]);
      opPromises.push(
        pushInsert('lead_status_history', newHist).catch(err => console.warn("Failed to insert lead status history:", err?.message || err))
      );
    }

    await Promise.all(opPromises);

    const customerName = targetOrder ? targetOrder.customer_name : 'Customer';
    const eventName = targetOrder ? (targetOrder.event_type || targetOrder.package_name || 'Event') : 'Wedding';
    const formattedDate = event_date || (targetOrder ? targetOrder.event_date : '');

    // Non-blocking notification
    addNotification({
      user_id: 'All',
      project_id: orderId,
      task_id: 'Operations Assignment',
      notification_type: 'Event Scheduled',
      title: '📅 Event Scheduled',
      message: `${eventName} Event has been scheduled. Customer: ${customerName}. Event: ${eventName}. Date: ${formattedDate}.`,
      recipient_role: 'Sales Team'
    }).catch(err => console.warn("Notification dispatch notice:", err));

    addNotification({
      user_id: 'All',
      project_id: orderId,
      task_id: 'Operations Assignment',
      notification_type: 'Event Scheduled',
      title: '📅 Event Scheduled',
      message: `${eventName} Event has been scheduled. Customer: ${customerName}. Event: ${eventName}. Date: ${formattedDate}.`,
      recipient_role: 'Business Owner'
    });

    logActivity(`Assigned Crew for Order: ${orderId} (Status: ${targetStatus})`, 'Operations', opId, previousStage, targetStageNum);
  };

  const saveStaffAssignments = async (
    orderId: string,
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
    }[],
    targetStage?: CurrentStage,
    metaPayload?: {
      updatedEvents?: any[];
      equipmentKit?: string;
      reportingTime?: string;
      eventDate?: string;
      eventTime?: string;
      remarks?: string;
      equipmentUpdates?: { equipmentId: string; status: string }[];
      equipmentHistoryInserts?: any[];
    }
  ) => {
    if (!orderId) {
      throw new Error("Missing Required Field: order_id is null or empty.");
    }

    const targetOrder = augmentedOrders.find((o) => o.order_id === orderId);
    if (!targetOrder) {
      throw new Error(`Missing Order Record: Order ${orderId} not found locally.`);
    }

    const leadId = targetOrder.lead_id;
    if (!leadId) {
      throw new Error(`Missing Required Field: lead_id is null for Order ${orderId}.`);
    }

    const targetLead = leads.find(l => l.lead_id === leadId);
    if (!targetLead) {
      throw new Error(`Missing Lead Record: Lead ${leadId} not found locally.`);
    }

    const targetOp = augmentedOperations.find(o => o.order_id === orderId);
    const roleParts = (currentUserName && currentUserName.includes('|')) 
      ? currentUserName.split('|') 
      : [currentUserName || 'System', currentRole || 'System'];
    const changedBy = roleParts[0];

    // Delegate to centralized operations assignment service
    const result = await executeSaveStaffAssignments({
      orderId,
      leadId,
      assignments,
      targetStage: targetStage as string,
      metaPayload,
      existingStaffAssignments: staffAssignments || [],
      currentUserName: changedBy,
      currentRole,
      staffList: staff || [],
      pushUpdateFn: pushUpdate,
      pushInsertFn: pushInsert
    });

    // Optimistically update React states
    setStaffAssignments(prev => {
      const otherOrders = prev.filter(sa => sa.order_id !== orderId);
      const combined = [...otherOrders, ...result.savedAssignments];
      try {
        localStorage.setItem('erp_staff_assignments', JSON.stringify(combined));
      } catch (e) {}
      return combined;
    });

    setOperations(prev => prev.map(op => op.order_id === orderId ? { ...op, ...result.opUpdates } : op));
    setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, ...result.orderUpdates } : o));
    setLeads(prev => prev.map(l => l.lead_id === leadId ? { ...l, ...result.leadUpdates } : l));

    if (metaPayload?.equipmentUpdates && metaPayload.equipmentUpdates.length > 0) {
      setEquipment(prev => prev.map(eq => {
        const match = metaPayload.equipmentUpdates?.find(u => u.equipmentId === eq.equipment_id);
        return match ? { ...eq, status: match.status as any } : eq;
      }));
    }

    if (metaPayload?.equipmentHistoryInserts && metaPayload.equipmentHistoryInserts.length > 0) {
      setLeadEquipmentHistory(prev => [...(prev || []), ...metaPayload.equipmentHistoryInserts!]);
    }

    const currentLeadStage = targetLead.current_status || targetLead.status || 'Order Confirmed';
    logActivity(`Assigned Crew for Order: ${orderId} (Status: ${targetStage || 'Assigned Crew'})`, 'Operations', targetOp?.operation_id || orderId, currentLeadStage, targetStage);

    // Create notifications for assigned staff asynchronously in background
    Promise.all(assignments.flatMap((a) => {
      const ord = augmentedOrders.find((o) => o.order_id === orderId);
      const op = augmentedOperations.find((o) => o.order_id === orderId);
      const customerName = ord?.customer_name || 'Valued Client';
      const eventType = ord?.event_type || 'Event';
      const eventDate = ord?.event_date || 'N/A';
      const reportingTime = result.opUpdates?.reporting_time || op?.reporting_time || '08:00';

      return [
        // 1. New Event Assigned
        addNotification({
          user_id: a.staff_id,
          project_id: orderId,
          task_id: 'Shoot',
          notification_type: 'New Event Assigned',
          title: 'New Event Assigned',
          message: `You have been assigned as ${a.staff_role} for ${customerName}'s ${eventType} (Order: ${orderId}) on ${eventDate}.`,
          recipient_role: 'Operations Team'
        }),

        // 2. Event Tomorrow Reminder
        addNotification({
          user_id: a.staff_id,
          project_id: orderId,
          task_id: 'Shoot',
          notification_type: 'Event Tomorrow Reminder',
          title: 'Event Tomorrow Reminder',
          message: `Reminder: Tomorrow is the ${eventType} shoot for ${customerName} (Order: ${orderId}). Please report at ${reportingTime}.`,
          recipient_role: 'Operations Team'
        }),

        // 3. Event Today Reminder
        addNotification({
          user_id: a.staff_id,
          project_id: orderId,
          task_id: 'Shoot',
          notification_type: 'Event Today Reminder',
          title: 'Event Today Reminder',
          message: `Reminder: Today is the ${eventType} shoot for ${customerName} (Order: ${orderId}). Report on time at ${reportingTime} and update status through ERP.`,
          recipient_role: 'Operations Team'
        })
      ];
    })).catch(err => console.warn("Staff notification background dispatch:", err));
  };


  // 5. Mark Event Completed (Action button in Operations)
  const markEventCompleted = async (orderId: string, serverPath: string) => {
    const trackingId = `TRK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
    const pId = `PRD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;

    const newRawFootage: RawFootage = {
      tracking_id: trackingId,
      order_id: orderId,
      event_completed_date: new Date().toISOString().split('T')[0],
      raw_received: false,
      server_path: serverPath || `s3://photocrew-vault-production/2026/${orderId}-shoot/raw/`,
      uploaded_by: currentUserName,
      uploaded_date: new Date().toISOString(),
      status: 'Pending',
    };

    const targetOrder = augmentedOrders.find((o) => o.order_id === orderId);

    const newProd: any = {
      production_id: pId,
      tracking_id: trackingId,
      editor_assigned: 'Unassigned',
      raw_footage_location: newRawFootage.server_path,
      editing_status: 'Raw Footage Received',
      remarks: 'Raw footage uploaded. Awaiting editor assignment.',
      order_id: orderId,
      lead_id: targetOrder?.lead_id || '',
      customer_name: targetOrder?.customer_name || '',
      event_id: targetOrder?.event_type || '',
      assigned_team: targetOrder?.assigned_team || 'Unassigned',
      final_consolidated_drive_link: newRawFootage.server_path,
      current_status: 'Raw Footage Received',
      created_at: new Date().toISOString()
    };

    const previousStage = targetOrder ? targetOrder.current_stage : 'Event Scheduled';
    const timestamp = new Date().toISOString();

    // Update Operations status to completed
    const r1 = await pushUpdate('operations', 'order_id', orderId, { event_status: 'Completed' });
    if (!r1?.success) throw new Error("Failed to update operations status");

    // Update order & lead stage to 'Event Completed'
    const r2 = await pushUpdate('orders', 'order_id', orderId, { 
      current_stage: 'Event Completed',
      updated_by: currentUserName,
      updated_at: timestamp
    });
    if (!r2?.success) throw new Error("Failed to update order status");

    if (targetOrder) {
      const r3 = await pushUpdate('leads', 'lead_id', targetOrder.lead_id, { 
        status: 'Event Completed',
        current_status: 'Event Completed',
        updated_by: currentUserName,
        updated_at: timestamp
      });
      if (!r3?.success) throw new Error("Failed to update lead status");
    }

    const rRf = await pushInsert('raw_footage', newRawFootage);
    if (!rRf?.success) throw new Error("Failed to insert raw footage: " + rRf?.error);
    const rProd = await pushInsert('production', newProd);
    if (!rProd?.success) throw new Error("Failed to insert production data: " + rProd?.error);

    //  // Disabled to prevent full reload

    const customerName = targetOrder ? targetOrder.customer_name : 'Customer';
    const eventName = targetOrder ? (targetOrder.event_type || targetOrder.package_name || 'Event') : 'Wedding';

    // 1. Event Completed for Operations Team and Business Owner
    addNotification({
      user_id: 'All',
      project_id: orderId,
      task_id: 'Operations Completion',
      notification_type: 'Event Completed',
      title: '✅ Event Completed',
      message: `${eventName} coverage has been completed. Customer: ${customerName}.`,
      recipient_role: 'Operations Team'
    });
    addNotification({
      user_id: 'All',
      project_id: orderId,
      task_id: 'Operations Completion',
      notification_type: 'Event Completed',
      title: '✅ Event Completed',
      message: `${eventName} coverage has been completed. Customer: ${customerName}.`,
      recipient_role: 'Business Owner'
    });

    // 2. New Event Ready for Editing for Production Team
    addNotification({
      user_id: 'All',
      project_id: orderId,
      task_id: 'Editing Ready',
      notification_type: 'New Event Ready for Editing',
      title: '🎥 New Event Ready for Editing',
      message: `Raw footage for "${eventName}" (Order: ${orderId}) is ready for editing. Customer: ${customerName}.`,
      recipient_role: 'Production Team'
    });

    logActivity(`Marked Event Completed for Order ${orderId}. Raw Footage recorded: ${trackingId}`, 'Operations', orderId, previousStage, 'Event Completed');
  };

  // 6. Production updates (Editing progress, review, approval)
  const updateProduction = async (
    productionId: string, 
    updates: Partial<Omit<Production, 'production_id' | 'tracking_id'>>
  ) => {
    let trackingIdToUpdate = '';
    
    // De-mock production ID if it is PRD-lead_id
    const inferredTrackingId = productionId.startsWith('PRD-') ? productionId.replace('PRD-', '') : productionId;
    let targetProd = augmentedProduction.find((p) => p.production_id === productionId || p.tracking_id === inferredTrackingId);

    // Map Client Accepted to Client Acceptance to ensure proper status history synchronization
    if (updates.editing_status === 'Client Accepted' || updates.editing_status === 'Client Acceptance') {
      updates.editing_status = 'Client Acceptance' as any;
      updates.current_status = 'Client Acceptance' as any;
      updates.production_status = 'Client Acceptance' as any;
    }
    if (updates.production_status === 'Client Accepted') {
      updates.production_status = 'Client Acceptance' as any;
    }
    if (updates.current_status === 'Client Accepted') {
      updates.current_status = 'Client Acceptance' as any;
    }

    let previousStage: CurrentStage = 'Raw Footage Received';
    if (targetProd) {
      const rf = rawFootage.find((f) => f.tracking_id === targetProd.tracking_id);
      const linkedOrder = rf ? augmentedOrders.find((o) => o.order_id === rf.order_id) : undefined;
      if (linkedOrder) {
        previousStage = linkedOrder.current_stage;
      }
    } else {
      // Look up in leads
      const linkedLead = leads.find(l => l.lead_id === inferredTrackingId);
      if (linkedLead) {
        previousStage = linkedLead.status as any;
      }
    }

    const orderName = 'Project';
    const oId = inferredTrackingId;

    // Automatically set dates when stages are completed
    if (updates.editing_status) {
      const todayDateStr = new Date().toISOString().split('T')[0];
      if (updates.editing_status === 'Editing Started') {
        updates.editing_start_date = todayDateStr;
      } else if (['Project Delivered', 'Delivered', 'Completed'].includes(updates.editing_status)) {
        updates.delivery_date = todayDateStr;
        updates.actual_delivery_date = todayDateStr;
      }
    }

    // Send notifications if needed
    if (updates.editor_assigned && updates.editor_assigned !== 'Unassigned') {
      const oldEditor = targetProd?.editor_assigned;
      if (!oldEditor || oldEditor === 'Unassigned' || oldEditor === '') {
        addNotification({
          user_id: updates.editor_assigned,
          project_id: productionId,
          task_id: 'Editing',
          notification_type: 'Task Assigned',
          title: 'Editing Task Assigned',
          message: `A new editing task (Order: ${oId}) has been assigned to ${updates.editor_assigned}.`,
          recipient_role: 'Production Team'
        });
      } else if (oldEditor !== updates.editor_assigned) {
        addNotification({
          user_id: updates.editor_assigned,
          project_id: productionId,
          task_id: 'Editing',
          notification_type: 'Task Reassigned',
          title: 'Editing Task Reassigned',
          message: `Editing task (Order: ${oId}) has been reassigned from ${oldEditor} to ${updates.editor_assigned}.`,
          recipient_role: 'Production Team'
        });
      }
    }

    if (updates.editing_status && (!targetProd || updates.editing_status !== targetProd.editing_status)) {
      const status = updates.editing_status;
      if (status === 'Client Review Sent') {
        addNotification({
          user_id: targetProd?.editor_assigned || 'Unassigned',
          project_id: productionId,
          task_id: 'Editing',
          notification_type: 'Task Completed',
          title: 'Editing Task Completed',
          message: `Editing completed by ${targetProd?.editor_assigned || 'Editor'} (Order: ${oId}). Sent for customer review.`,
          recipient_role: 'Operations Team'
        });
      } else if (status === 'Revision Required') {
        addNotification({
          user_id: targetProd?.editor_assigned || 'Unassigned',
          project_id: productionId,
          task_id: 'Review',
          notification_type: 'Revision Requested',
          title: 'Project Revision Requested',
          message: `Revision was requested (Order: ${oId}). Status updated to Revision Required.`,
          recipient_role: 'Production Team'
        });
      } else if (status === 'Final Approval') {
        addNotification({
          user_id: targetProd?.editor_assigned || 'Unassigned',
          project_id: productionId,
          task_id: 'Review',
          notification_type: 'Project Approved',
          title: 'Project Customer Approved',
          message: `Project (Order: ${oId}) was approved by the customer.`,
          recipient_role: 'All'
        });
      }
    }

    const timestamp = new Date().toISOString();

    // Ensure raw footage row exists if needed before inserting production
    if (!targetProd) {
      let tempOrder = augmentedOrders.find(o => o.order_id === inferredTrackingId || o.lead_id === inferredTrackingId);
      if (!tempOrder) {
        const rf = rawFootage.find(f => f.tracking_id === inferredTrackingId || f.order_id === inferredTrackingId);
        if (rf) {
          tempOrder = augmentedOrders.find(o => o.order_id === rf.order_id);
        }
      }
      if (tempOrder) {
        const rfExists = rawFootage.some(f => f.tracking_id === inferredTrackingId);
        if (!rfExists) {
          const dummyRF = {
            tracking_id: inferredTrackingId,
            order_id: tempOrder.order_id,
            event_completed_date: tempOrder.event_date || new Date().toISOString().split('T')[0],
            raw_received: false,
            server_path: '',
            uploaded_by: currentUserName,
            uploaded_date: new Date().toISOString(),
            status: 'Pending'
          };
          const rRF = await pushInsert('raw_footage', dummyRF);
          if (rRF?.success) {
            setRawFootage(prev => [dummyRF as any, ...prev]);
          } else {
            console.warn("[updateProduction] Failed to auto-insert raw_footage placeholder:", rRF?.error);
          }
        }
      }
    }

    // Normalize status updates according to workflow rules
    const incomingStatus = updates.current_status || updates.editing_status || updates.production_status;
    if (incomingStatus) {
      const norm = normalizeProductionStatus(updates.editing_status, updates.current_status, updates.production_status);
      updates.editing_status = norm.editing_status;
      updates.current_status = norm.current_status;
      updates.production_status = norm.production_status;
    }

    // Set production state in Supabase
    try {

      if (targetProd) {
        const rProd = await pushUpdate('production', 'production_id', targetProd.production_id, updates);
        if (!rProd?.success) {
          console.warn("[updateProduction] DB operation failed for production table update:", rProd?.error);
          throw new Error(rProd?.error || "DB operation failed for production table update");
        } else {
          setProduction(prev => prev.map(p => p.production_id === targetProd.production_id ? { ...p, ...updates } : p));
        }

        // Also update any secondary production records linked to this project
        const secondaryProds = augmentedProduction.filter(p => 
          p.production_id !== targetProd?.production_id && (
            p.tracking_id === targetProd?.tracking_id ||
            p.order_id === targetProd?.tracking_id ||
            p.tracking_id === inferredTrackingId ||
            p.order_id === inferredTrackingId ||
            (targetProd?.order_id && p.order_id === targetProd.order_id) ||
            (targetProd?.lead_id && p.lead_id === targetProd.lead_id)
          )
        );
        for (const sp of secondaryProds) {
          pushUpdate('production', 'production_id', sp.production_id, updates).catch(e => console.warn("[updateProduction] secondary update:", e));
          setProduction(prev => prev.map(p => p.production_id === sp.production_id ? { ...p, ...updates } : p));
        }
      } else {
        const newPId = productionId.startsWith('PRD-') ? `PRD-${Math.floor(100000 + Math.random() * 899999)}` : productionId;
        const newProd: Production = {
          production_id: newPId,
          tracking_id: inferredTrackingId,
          editor_assigned: updates.editor_assigned || 'Unassigned',
          editing_status: (updates.editing_status || previousStage || 'Raw Footage Received') as any,
          remarks: updates.remarks || '',
          project_priority: updates.project_priority || 'Medium',
          raw_footage_location: updates.raw_footage_location || '',
          target_delivery_date: updates.target_delivery_date || '',
          expected_delivery_date: updates.expected_delivery_date || '',
          ...updates
        };
        const rProd = await pushInsert('production', newProd);
        if (!rProd?.success) {
          console.warn("[updateProduction] DB operation failed for production table insert:", rProd?.error);
          throw new Error(rProd?.error || "DB operation failed for production table insert");
        } else {
          setProduction(prev => [newProd, ...prev]);
        }
      }

      // If updating to Client Acceptance, synchronize editor assignments as well
      if (updates.editing_status === 'Client Acceptance' || updates.current_status === 'Client Acceptance') {
        const linkedAssigns = (editorAssignments || []).filter(a =>
          a.production_id === productionId ||
          a.production_id === targetProd?.production_id ||
          a.order_id === inferredTrackingId ||
          a.production_id === inferredTrackingId ||
          (targetProd && (a.order_id === targetProd.order_id || a.order_id === targetProd.tracking_id || a.production_id === targetProd.tracking_id))
        );
        for (const la of linkedAssigns) {
          pushUpdate('editor_assignments', 'assignment_id', la.assignment_id, {
            status: 'Client Acceptance'
          }).catch(e => console.warn("[updateProduction] Editor assignment status sync error:", e));
        }
        setEditorAssignments(prev => prev.map(a => {
          const isLinked = a.production_id === productionId ||
            a.production_id === targetProd?.production_id ||
            a.order_id === inferredTrackingId ||
            a.production_id === inferredTrackingId ||
            (targetProd && (a.order_id === targetProd.order_id || a.order_id === targetProd.tracking_id || a.production_id === targetProd.tracking_id));
          return isLinked ? { ...a, status: 'Client Acceptance' as any } : a;
        }));
      }
    } catch (prodErr: any) {
      console.warn("[updateProduction] Production DB write exception:", prodErr?.message || prodErr);
      throw prodErr;
    }

    const actualTrackingId = targetProd ? targetProd.tracking_id : inferredTrackingId;

    // Find linked order using all possible connections (including order_id, lead_id on targetProd)
    let tgtOrder = augmentedOrders.find(o => 
      (targetProd && (o.order_id === (targetProd as any).order_id || o.lead_id === (targetProd as any).lead_id || o.order_id === targetProd.tracking_id || o.lead_id === targetProd.tracking_id)) ||
      o.order_id === actualTrackingId || 
      o.lead_id === actualTrackingId ||
      o.order_id === inferredTrackingId ||
      o.lead_id === inferredTrackingId ||
      o.order_id === productionId ||
      o.lead_id === productionId
    );
    if (!tgtOrder) {
      const rf = rawFootage.find(f => f.tracking_id === actualTrackingId || f.order_id === actualTrackingId || (targetProd && f.tracking_id === targetProd.tracking_id));
      if (rf) {
        tgtOrder = augmentedOrders.find(o => o.order_id === rf.order_id);
      }
    }

    // Find linked lead using all possible connections
    let tgtLead = leads.find(l => 
      (tgtOrder && l.lead_id === tgtOrder.lead_id) ||
      (targetProd && (l.lead_id === (targetProd as any).lead_id || l.lead_id === targetProd.tracking_id)) ||
      l.lead_id === actualTrackingId ||
      l.lead_id === inferredTrackingId ||
      l.lead_id === inferredTrackingId.replace('PRD-', '') ||
      l.lead_id === productionId
    );

    // Determine Stage to update on Order and Lead
    let nextStage: CurrentStage | null = null;
    if (updates.editing_status) {
      nextStage = updates.editing_status as any;
    } else if (updates.editor_assigned && updates.editor_assigned !== 'Unassigned') {
      nextStage = 'Editor Assigned';
    } else if (targetProd) {
      nextStage = targetProd.editing_status as any;
    }

    // Map strings & enforce Business Owner Review before closure
    if (['Closed', 'Order Closed', 'Project Closed', 'Completed', 'Project Completed'].includes(nextStage as string)) {
      if (currentRole !== 'Business Owner' && updates.editing_status !== 'Order Closed') {
        const tgtPayment = payments.find(p => p.order_id === (tgtOrder?.order_id || actualTrackingId) || p.lead_id === (tgtLead?.lead_id));
        
        const validation = performBusinessOwnerReview(tgtOrder, tgtLead, targetProd, tgtPayment);
        if (!validation.isValid) {
          nextStage = 'Business Owner Review';
          logActivity(
            `Business Owner Review Pending for Order ${tgtOrder?.order_id || actualTrackingId}. Pending items: ${validation.pendingItems.join('; ')}`,
            'Business Owner',
            tgtOrder?.order_id || actualTrackingId,
            previousStage,
            'Business Owner Review'
          );
        } else {
          nextStage = 'Order Closed';
          logActivity(
            `Business Owner Review Completed & Validated. Reviewed By: ${currentUserName || 'Business Owner'}, Review Date & Time: ${new Date().toISOString()}, Final Status: Order Closed. Notes: ${updates.remarks || 'None'}`,
            'Business Owner',
            tgtOrder?.order_id || actualTrackingId,
            'Business Owner Review',
            'Order Closed'
          );
        }
      } else {
        nextStage = 'Order Closed';
        logActivity(
          `Business Owner Review Completed & Order Closed. Reviewed By: ${currentUserName || 'Business Owner'}, Review Date & Time: ${new Date().toISOString()}, Final Status: Order Closed. Notes: ${updates.remarks || 'None'}`,
          'Business Owner',
          tgtOrder?.order_id || actualTrackingId,
          'Business Owner Review',
          'Order Closed'
        );
      }
    } else if (nextStage === 'Project Delivered') {
      nextStage = 'Delivered';
    }

    const leadIdToUpdate = tgtLead?.lead_id || tgtOrder?.lead_id || (actualTrackingId.startsWith('PRD-') ? actualTrackingId.replace('PRD-', '') : actualTrackingId);

    const relatedPromises: Promise<any>[] = [];

    if (nextStage && leadIdToUpdate) {
      const leadUpdates: any = {
        updated_by: currentUserName,
        updated_at: timestamp
      };
      if (nextStage) {
        leadUpdates.status = nextStage;
        leadUpdates.current_status = nextStage;
      }
      if (updates.editor_assigned) {
        leadUpdates.assigned_editor = updates.editor_assigned;
      }
      if (updates.assigned_staff) {
        leadUpdates.assigned_editors = updates.assigned_staff;
      }
      if (updates.target_delivery_date) {
        leadUpdates.delivery_target_date = updates.target_delivery_date;
      }
      if ((updates as any).production_role) {
        leadUpdates.production_role = (updates as any).production_role;
      } else if ((updates as any).assigned_role) {
        leadUpdates.production_role = (updates as any).assigned_role;
      }
      
      setLeads(prev => prev.map(l => l.lead_id === leadIdToUpdate ? { ...l, ...leadUpdates } : l));
      relatedPromises.push(
        pushUpdate('leads', 'lead_id', leadIdToUpdate, leadUpdates).catch(err => console.warn("Lead update warning:", err))
      );
    }

    if (nextStage && tgtOrder) {
      let orderStage = nextStage;
      if (orderStage === 'Client Review Sent') orderStage = 'Customer Review';
      if (orderStage === 'Final Approval') orderStage = 'Approved';

      const isAllowedInOrders = !['Editing In Progress', 'Editor Assigned', 'Internal QC Review', 'Revision Required', 'Revision In Progress'].includes(orderStage);
      if (isAllowedInOrders) {
        const ordUpdates: any = {
          current_stage: orderStage,
          updated_by: currentUserName,
          updated_at: timestamp
        };
        setOrders(prev => prev.map(o => o.order_id === tgtOrder!.order_id ? { ...o, ...ordUpdates } : o));
        relatedPromises.push(
          pushUpdate('orders', 'order_id', tgtOrder.order_id, ordUpdates).catch(err => console.warn("Order stage update warning:", err))
        );
      }
    }
    // Record status history & proof attachment
    if (updates.editing_status && nextStage && (previousStage !== nextStage || updates.client_communication_proof)) {
      const roleParts = (currentUserName && currentUserName.includes('|')) 
        ? currentUserName.split('|') 
        : [currentUserName || 'Production Staff', currentRole || 'Production'];
      const changedBy = roleParts[0];
      const changedByRole = roleParts[1] || currentRole || 'Production';
      const proofToRecord = updates.client_communication_proof || (updates as any).customer_communication_proof || (updates as any).proof_url;

      const newHist = {
        lead_id: leadIdToUpdate || actualTrackingId,
        order_id: tgtOrder?.order_id || actualTrackingId,
        old_status: previousStage,
        new_status: nextStage,
        changed_by: changedBy,
        changed_by_role: changedByRole,
        remarks: updates.remarks || (nextStage === 'Client Acceptance' ? 'Client acceptance approved with communication & consent proof' : `Production status updated to ${nextStage}`),
        proof_url: proofToRecord || null,
        created_at: timestamp
      };

      setStatusHistory(prev => [...prev, newHist as any]);
      relatedPromises.push(
        pushInsert('lead_status_history', newHist).catch(shErr => console.warn("Failed to insert lead_status_history in updateProduction:", shErr))
      );
    }

    if (relatedPromises.length > 0) {
      await Promise.all(relatedPromises);
    }

    // Trigger fresh database fetch to ensure complete synchronization
    fetchFromDb(false).catch(e => console.warn('fetchFromDb sync warning:', e?.message || e));

    logActivity(
      `Updated Production ${productionId}: status=${updates.editing_status || 'unchanged'}`, 
      'Production', 
      productionId,
      previousStage,
      nextStage || previousStage
    );
  };

  // accept raw footage as post-production audit step
  const acceptRawFootage = async (trackingId: string) => {
    const rf = rawFootage.find((f) => f.tracking_id === trackingId);
    if (!rf) return;

    const orderId = rf.order_id;
    const previousStage = augmentedOrders.find((o) => o.order_id === orderId)?.current_stage || 'Event Completed';
    const timestamp = new Date().toISOString();

    const r1 = await pushUpdate('raw_footage', 'tracking_id', trackingId, { status: 'Received' });
    if (!r1?.success) {
      throw new Error("Failed to update raw footage status in database.");
    }

    const r2 = await pushUpdate('orders', 'order_id', orderId, { 
      current_stage: 'Raw Footage Received',
      updated_by: currentUserName,
      updated_at: timestamp
    });
    if (!r2?.success) {
      throw new Error("Failed to update order status in database.");
    }

    const targetOrder = augmentedOrders.find((o) => o.order_id === orderId);
    if (targetOrder) {
      const r3 = await pushUpdate('leads', 'lead_id', targetOrder.lead_id, { 
        status: 'Raw Footage Received',
        current_status: 'Raw Footage Received',
        updated_by: currentUserName,
        updated_at: timestamp
      });
      if (!r3?.success) {
        throw new Error("Failed to update lead status in database.");
      }
    }

    //  // Disabled to prevent full reload

    logActivity(`Audited & accepted Raw Footage for Order: ${orderId}. Assigned to editing pipelines.`, 'Production', orderId, previousStage, 'Raw Footage Received');
  };

  const confirmRawFootageReceived = async (
    orderId: string,
    footageLink?: string,
    storageType?: string,
    uploadNotes?: string,
    paymentCollectionStatus?: string,
    additionalReceived?: number,
    transactionId?: string
  ) => {
    // 1. Identify target order and corresponding lead with complete precision
    const targetOrder = augmentedOrders.find((o) => o.order_id === orderId || o.lead_id === orderId) || orders.find((o) => o.order_id === orderId || o.lead_id === orderId);
    
    let matchedLead = leads.find((l) => 
      (targetOrder?.lead_id && l.lead_id === targetOrder.lead_id) ||
      l.lead_id === orderId ||
      l.order_id === orderId ||
      (targetOrder && targetOrder.customer_name && targetOrder.mobile && l.customer_name === targetOrder.customer_name && l.mobile === targetOrder.mobile)
    );

    if (!matchedLead && orderId.startsWith('OR')) {
      const numPart = orderId.replace(/\D/g, '');
      if (numPart) {
        matchedLead = leads.find(l => l.lead_id.replace(/\D/g, '') === numPart || l.lead_id === `LD${numPart.padStart(3, '0')}`);
      }
    }

    const effOrderId = targetOrder?.order_id || (orderId.startsWith('OR') ? orderId : (matchedLead ? (matchedLead.lead_id.startsWith('LD') ? `OR${matchedLead.lead_id.replace(/\D/g, '').padStart(3, '0')}` : matchedLead.lead_id) : orderId));
    const effLeadId = targetOrder?.lead_id || matchedLead?.lead_id || (orderId.startsWith('LD') ? orderId : (matchedLead ? matchedLead.lead_id : (orderId.startsWith('OR') ? `LD${orderId.replace(/\D/g, '').padStart(3, '0')}` : undefined)));
    const previousStage = targetOrder?.current_stage || matchedLead?.current_status || matchedLead?.status || 'Footage Handover';
    const targetStage: CurrentStage = 'Verified Footage';

    const resolvedLink = (footageLink && footageLink.trim()) ? footageLink.trim() : `s3://photocrew-vault-production/2026/${effOrderId}-shoot/raw/`;
    const timestamp = new Date().toISOString();

    // 2. Save raw footage consolidated link record in DB first
    let existingRf = rawFootage.find(f => f.order_id === effOrderId || (effLeadId && f.order_id === effLeadId));
    let trackingId = existingRf?.tracking_id || `TRK-${Math.floor(2012 + Math.random() * 850)}`;
    const todayYyyyMmDd = timestamp.split('T')[0];

    const finalRf: RawFootage = {
      tracking_id: trackingId,
      order_id: effOrderId,
      event_completed_date: existingRf?.event_completed_date || todayYyyyMmDd,
      raw_received: true,
      server_path: resolvedLink,
      drive_link: resolvedLink,
      uploaded_by: currentUserName || 'Operations Team',
      uploaded_date: timestamp,
      status: 'Received',
      storage_type: storageType || 'Google Drive',
      upload_notes: uploadNotes || '',
    };

    const rRf = await pushUpsert('raw_footage', finalRf);
    if (!rRf?.success) {
      console.error("[confirmRawFootageReceived] Failed to save raw footage record:", rRf?.error);
      throw new Error(`Failed to save raw footage record: ${rRf?.error || 'Database save failed'}`);
    }
    const actualTrackingId = (rRf as any)?.data?.[0]?.tracking_id || existingRf?.tracking_id || trackingId;

    // 3. Immediately update orders table in Supabase to 'Verified Footage'
    const orderUpdates = { 
      current_stage: targetStage,
      order_status: 'Confirmed',
      updated_by: currentUserName || 'Operations Team',
      updated_at: timestamp
    };
    const rOrd = await pushUpdate('orders', 'order_id', effOrderId, orderUpdates);
    
    // Ensure order exists in Supabase DB even if it was originally synthesized from leads
    const orderAlreadyInDb = orders.some(o => o.order_id === effOrderId);
    if (!rOrd?.success || !orderAlreadyInDb) {
      const fullOrderRecord = {
        order_id: effOrderId,
        lead_id: effLeadId || null,
        customer_name: targetOrder?.customer_name || matchedLead?.customer_name || 'Client',
        mobile: targetOrder?.mobile || matchedLead?.mobile || '',
        event_type: targetOrder?.event_type || matchedLead?.event_type || 'Main Event',
        event_date: targetOrder?.event_date || matchedLead?.event_date || timestamp.split('T')[0],
        current_stage: targetStage,
        order_status: 'Confirmed',
        quotation_amount: targetOrder?.quotation_amount || matchedLead?.budget || 0,
        sales_person: targetOrder?.sales_person || matchedLead?.sales_person || 'Sales Team',
        created_at: targetOrder?.created_at || timestamp,
        updated_by: currentUserName || 'Operations Team',
        updated_at: timestamp
      };
      const rUpsertOrder = await pushUpsert('orders', fullOrderRecord);
      if (!rUpsertOrder?.success) {
        console.warn("[confirmRawFootageReceived] Order upsert warning:", rUpsertOrder?.error);
      }
    }
    if (effLeadId) {
      await pushUpdate('orders', 'lead_id', effLeadId, orderUpdates).catch(() => {});
    }

    // 4. Immediately update leads table in Supabase to 'Verified Footage'
    if (effLeadId) {
      const rLead = await pushUpdate('leads', 'lead_id', effLeadId, { 
        status: targetStage,
        current_status: targetStage,
        updated_by: currentUserName || 'Operations Team',
        updated_at: timestamp
      });
      if (!rLead?.success) {
        console.error("[confirmRawFootageReceived] Failed to update leads table:", rLead?.error);
        throw new Error(`Failed to update lead status to Verified Footage: ${rLead?.error || 'Database update failed'}`);
      }
    }

    // 5. Update operations record in Supabase with event_status: 'Verified Footage' and final drive link
    const opUpdates = { 
      event_status: targetStage,
      Upload_Notes_Remarks: uploadNotes || '',
      upload_notes_remarks: uploadNotes || '',
      Raw_Footage_Drive_Link: resolvedLink,
      raw_footage_drive_link: resolvedLink,
      Consolidated_Drive_Link: resolvedLink,
      consolidated_drive_link: resolvedLink,
      updated_by: currentUserName || 'Operations Team',
      updated_at: timestamp
    };
    const rOp = await pushUpdate('operations', 'order_id', effOrderId, opUpdates);
    if (!rOp?.success) {
      console.warn("[confirmRawFootageReceived] Operations update warning:", rOp?.error);
      await pushUpsert('operations', {
        operation_id: `OP-${effOrderId}`,
        order_id: effOrderId,
        photographer_assigned: 'Unassigned',
        videographer_assigned: 'Unassigned',
        drone_operator_assigned: 'Unassigned',
        assistant_assigned: 'Unassigned',
        equipment_kit: '',
        reporting_time: '08:00',
        ...opUpdates
      }).catch(e => console.warn("Failed to upsert operations record:", e));
    }

    // 6. Update staff assignments in DB to Completed & Verified Footage
    await pushUpdate('staff_assignments', 'order_id', effOrderId, {
      task_status: targetStage,
      assignment_status: 'Completed',
      raw_footage_link: resolvedLink,
      updated_by: currentUserName || 'Operations Team',
      updated_at: timestamp
    }).catch(e => console.warn("Failed to update staff assignments by order_id:", e));

    if (effLeadId) {
      await pushUpdate('staff_assignments', 'lead_id', effLeadId, {
        task_status: targetStage,
        assignment_status: 'Completed',
        raw_footage_link: resolvedLink,
        updated_by: currentUserName || 'Operations Team',
        updated_at: timestamp
      }).catch(e => console.warn("Failed to update staff assignments by lead_id:", e));
    }

    // 7. Update lead_events proof_type to 'Verified Footage' if events exist
    if (effLeadId) {
      try {
        await pushUpdate('lead_events', 'lead_id', effLeadId, {
          proof_type: targetStage,
          updated_at: timestamp
        });
      } catch (_) {}
    }

    // 8. Handle Payment Capture if provided
    if (paymentCollectionStatus && targetOrder) {
      const existingPayment = augmentedPayments.find(p => p.order_id === effOrderId);
      const totalAmount = targetOrder.quotation_amount || 0;
      const advanceAmount = targetOrder.advance_received || 0;
      const finalReceived = additionalReceived || 0;

      let payStatus: PaymentStatus = 'Pending';
      let balanceDue = totalAmount - advanceAmount - finalReceived;

      if (paymentCollectionStatus === 'Full Payment Received') {
        payStatus = 'Fully Paid';
        balanceDue = 0;
      } else if (paymentCollectionStatus === 'Partial Payment Received') {
        payStatus = 'Partially Paid';
      } else if (paymentCollectionStatus === 'Payment Pending') {
        payStatus = 'Pending';
        balanceDue = totalAmount - advanceAmount;
      }

      const payId = existingPayment?.payment_id || `PAY-${Math.floor(3000 + Math.random() * 1000)}`;
      const updatedPayment: Payment = {
        payment_id: payId,
        order_id: effOrderId,
        quotation_amount: totalAmount,
        advance_received: advanceAmount,
        final_payment_received: paymentCollectionStatus === 'Full Payment Received' ? (totalAmount - advanceAmount) : finalReceived,
        balance_due: balanceDue < 0 ? 0 : balanceDue,
        payment_status: payStatus,
        payment_collection_status: paymentCollectionStatus,
        additional_received: paymentCollectionStatus === 'Full Payment Received' ? (totalAmount - advanceAmount) : finalReceived,
        payment_date: new Date().toISOString().split('T')[0],
        transaction_id: transactionId || existingPayment?.transaction_id || undefined,
      };

      if (existingPayment) {
        const rPay = await pushUpdate('payments', 'payment_id', payId, updatedPayment);
        if (!rPay?.success) {
          console.warn("Failed to update payment details: " + rPay?.error);
        }
      } else {
        const rPay = await pushInsert('payments', updatedPayment);
        if (!rPay?.success) {
          console.warn("Failed to insert payment details: " + rPay?.error);
        }
      }
    }

    // 9. Record status history & equipment history
    const newHist = {
      lead_id: effLeadId || effOrderId,
      order_id: effOrderId,
      old_status: previousStage,
      new_status: targetStage,
      changed_by: currentUserName || 'Operations Team',
      changed_by_role: 'Operations Team',
      remarks: `Verified footage with consolidated link: ${resolvedLink}`,
      created_at: timestamp
    };
    setStatusHistory(prev => {
      const updated = [...prev, newHist];
      try { localStorage.setItem('erp_status_history', JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
    try { await pushInsert('lead_status_history', newHist); } catch (_) {}

    const newEquipmentHist = {
      lead_id: effLeadId || effOrderId,
      order_id: effOrderId,
      equipment_name: 'Raw Footage Verification',
      equipment_status: 'Verified Footage',
      returned_by: currentUserName || 'Operations Team',
      returned_at: timestamp,
      remarks: JSON.stringify({
        raw_footage_link: resolvedLink,
        current_status: 'Verified Footage',
        proof_type: 'Verified Footage',
        uploaded_by: currentUserName || 'Operations Team'
      }),
      created_at: timestamp
    };
    try { await pushInsert('lead_equipment_history', newEquipmentHist); } catch (_) {}
    setLeadEquipmentHistory(prev => [newEquipmentHist, ...prev]);

    // 10. Ensure production entry exists or update it
    let existingProd = augmentedProduction.find(p => p.tracking_id === actualTrackingId || p.tracking_id === effOrderId || p.order_id === effOrderId);
    let pId = existingProd?.production_id || `PRD-${Math.floor(4012 + Math.random() * 850)}`;

    const prodEditingStatus = (existingProd?.editing_status && !['Footage Handover', 'Raw Footage Received', 'Pending'].includes(existingProd.editing_status))
      ? existingProd.editing_status
      : 'Verified Footage';

    const newProd: any = {
      production_id: pId,
      tracking_id: actualTrackingId,
      editor_assigned: existingProd?.editor_assigned || 'Unassigned',
      raw_footage_location: resolvedLink,
      editing_status: prodEditingStatus,
      production_status: prodEditingStatus,
      remarks: `Raw footage received via ${storageType || 'Google Drive'}. ${uploadNotes || ''}`,
      order_id: effOrderId,
      lead_id: effLeadId || targetOrder?.lead_id || '',
      customer_name: targetOrder?.customer_name || matchedLead?.customer_name || 'Client',
      event_id: targetOrder?.event_type || 'Main Event',
      assigned_team: targetOrder?.assigned_team || 'Unassigned',
      final_consolidated_drive_link: resolvedLink,
      proof_url: resolvedLink,
      current_status: prodEditingStatus,
      created_at: timestamp
    };

    try {
      const rProd = await pushUpsert('production', newProd);
      if (!rProd?.success) {
        console.warn("[confirmRawFootageReceived] Production upsert warning:", rProd?.error);
      } else {
        setProduction(prev => {
          const idx = prev.findIndex(p => p.production_id === newProd.production_id || p.tracking_id === actualTrackingId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...newProd };
            return copy;
          }
          return [newProd, ...prev];
        });
      }
    } catch (prodErr) {
      console.warn("[confirmRawFootageReceived] Production upsert error:", prodErr);
    }

    // 11. Directly update local state for immediate reactivity (no page refresh required)
    setOrders(prev => {
      const updated = prev.map(o => (o.order_id === effOrderId || (effLeadId && (o.lead_id === effLeadId || o.order_id === effLeadId))) ? { ...o, current_stage: targetStage, order_status: 'Confirmed' } : o);
      try { localStorage.setItem('erp_orders', JSON.stringify(updated)); } catch (_) {}
      return updated;
    });
    if (effLeadId) {
      setLeads(prev => {
        const updated = prev.map(l => (l.lead_id === effLeadId || l.order_id === effOrderId) ? { ...l, status: targetStage, current_status: targetStage } : l);
        try { localStorage.setItem('erp_leads', JSON.stringify(updated)); } catch (_) {}
        return updated;
      });
    }
    setStaffAssignments(prev => {
      const updated = prev.map(sa => (sa.order_id === effOrderId || (effLeadId && sa.lead_id === effLeadId)) ? { ...sa, task_status: 'Verified Footage', assignment_status: 'Completed', raw_footage_link: sa.raw_footage_link || resolvedLink } : sa);
      try { localStorage.setItem('erp_staff_assignments', JSON.stringify(updated)); } catch (_) {}
      return updated;
    });

    setOperations(prev => {
      let found = false;
      const updated = prev.map(op => {
        if (op.order_id === effOrderId) {
          found = true;
          return {
            ...op,
            event_status: 'Verified Footage',
            Upload_Notes_Remarks: uploadNotes || '',
            upload_notes_remarks: uploadNotes || '',
            Raw_Footage_Drive_Link: resolvedLink,
            raw_footage_drive_link: resolvedLink,
            Consolidated_Drive_Link: resolvedLink,
            consolidated_drive_link: resolvedLink
          };
        }
        return op;
      });
      if (!found) {
        return [...updated, {
          operation_id: `OP-${effOrderId}`,
          order_id: effOrderId,
          photographer_assigned: 'Unassigned',
          videographer_assigned: 'Unassigned',
          drone_operator_assigned: 'Unassigned',
          assistant_assigned: 'Unassigned',
          equipment_kit: '',
          reporting_time: '08:00',
          event_status: 'Verified Footage',
          updated_by: currentUserName || 'Operations Team',
          Upload_Notes_Remarks: uploadNotes || '',
          upload_notes_remarks: uploadNotes || '',
          Raw_Footage_Drive_Link: resolvedLink,
          raw_footage_drive_link: resolvedLink,
          Consolidated_Drive_Link: resolvedLink,
          consolidated_drive_link: resolvedLink
        }];
      }
      return updated;
    });

    setRawFootage(prev => {
      const idx = prev.findIndex(f => f.order_id === effOrderId || f.tracking_id === actualTrackingId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...finalRf, tracking_id: actualTrackingId };
        return copy;
      }
      return [{ ...finalRf, tracking_id: actualTrackingId }, ...prev];
    });

    setProduction(prev => {
      const idx = prev.findIndex(p => p.tracking_id === actualTrackingId || p.production_id === pId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...newProd };
        return copy;
      }
      return [newProd, ...prev];
    });

    addNotification({
      user_id: 'All',
      project_id: effOrderId,
      task_id: 'Editing',
      notification_type: 'Task Assigned',
      title: 'New Raw Footage Received',
      message: `Raw footage for "${targetOrder?.package_name || 'Shoot'}" (Order: ${effOrderId}) has been received and verified. Storage Type: ${storageType || 'Google Drive'}. Ready for editing!`,
      recipient_role: 'Production Team'
    });

    logActivity(`Raw Footage Received and Confirmed in system for Order: ${effOrderId}. Drive Link: ${resolvedLink}. Storage: ${storageType || 'Google Drive'}`, 'Operations', effOrderId, previousStage, targetStage);

    // Broadcast synchronization events
    window.dispatchEvent(new CustomEvent('staff_status_updated'));
    window.dispatchEvent(new CustomEvent('order_status_updated', { detail: { orderId: effOrderId, leadId: effLeadId, status: 'Verified Footage' } }));
    broadcastSyncPing();
  };

  const updateOrderStage = async (orderId: string, stage: CurrentStage) => {
    const targetOrder = augmentedOrders.find((o) => o.order_id === orderId || o.lead_id === orderId);
    const resolvedOrderId = targetOrder ? targetOrder.order_id : orderId;
    const previousStage = targetOrder ? targetOrder.current_stage : 'Order Confirmed';
    const timestamp = new Date().toISOString();
    
    let targetStageToSave = stage;
    if (stage === 'Client Accepted' as any) {
      targetStageToSave = 'Client Acceptance' as any;
    }

    if (['Closed', 'Order Closed', 'Project Closed', 'Completed'].includes(targetStageToSave as string)) {
      targetStageToSave = 'Order Closed';
      logActivity(
        `Business Owner Review Completed & Order Closed. Reviewed By: ${currentUserName || 'Business Owner'}, Review Date & Time: ${timestamp}, Final Status: Order Closed.`,
        'Business Owner',
        resolvedOrderId,
        previousStage,
        'Order Closed'
      );
    }

    const rOrd = await pushUpdate('orders', 'order_id', resolvedOrderId, { 
      current_stage: targetStageToSave,
      updated_by: currentUserName,
      updated_at: timestamp
    });
    if (!rOrd?.success) {
      throw new Error("Failed to update order stage: " + rOrd?.error);
    } else {
      setOrders(prev => prev.map(o => o.order_id === resolvedOrderId ? { ...o, current_stage: targetStageToSave } : o));
    }

    if (targetOrder) {
      const rLead = await pushUpdate('leads', 'lead_id', targetOrder.lead_id, { 
        status: targetStageToSave,
        current_status: targetStageToSave,
        updated_by: currentUserName,
        updated_at: timestamp
      });
      if (!rLead?.success) {
        throw new Error("Failed to update lead status: " + rLead?.error);
      }
      setLeads(prev => prev.map(l => l.lead_id === targetOrder.lead_id ? { ...l, status: targetStageToSave, current_status: targetStageToSave } : l));
    }

    const isClientAcc = targetStageToSave === 'Client Acceptance' || targetStageToSave === 'Client Accepted' as any;
    const isClosedStage = ['Closed', 'Order Closed', 'Order Close', 'Project Closed', 'Completed'].includes(targetStageToSave as string);

    const linkedProds = augmentedProduction.filter(p => 
      p.tracking_id === resolvedOrderId || 
      p.order_id === resolvedOrderId || 
      p.production_id === resolvedOrderId ||
      (targetOrder && (p.lead_id === targetOrder.lead_id || p.tracking_id === targetOrder.lead_id))
    );

    let prodUpdatePayload: any = null;
    if (isClosedStage) {
      prodUpdatePayload = {
        editing_status: 'Order Closed',
        current_status: targetStageToSave === 'Order Close' ? 'Order Close' : 'Order Closed',
        production_status: 'Order Closed'
      };
    } else if (isClientAcc) {
      prodUpdatePayload = {
        editing_status: 'Client Acceptance',
        current_status: 'Client Acceptance',
        production_status: 'Client Acceptance'
      };
    } else {
      prodUpdatePayload = {
        editing_status: targetStageToSave,
        current_status: targetStageToSave,
        production_status: targetStageToSave
      };
    }

    if (prodUpdatePayload) {
      for (const lp of linkedProds) {
        pushUpdate('production', 'production_id', lp.production_id, prodUpdatePayload).catch(err => console.warn("[updateOrderStage] Production update warning:", err));
      }
      setProduction(prev => prev.map(p => {
        const isLinked = p.tracking_id === resolvedOrderId || p.order_id === resolvedOrderId || p.production_id === resolvedOrderId || (targetOrder && (p.lead_id === targetOrder.lead_id || p.tracking_id === targetOrder.lead_id));
        return isLinked ? { ...p, ...prodUpdatePayload } : p;
      }));

      // Also update linked editor assignments if Client Acceptance or Closed
      if (isClientAcc || isClosedStage) {
        const matchingAssignments = (editorAssignments || []).filter(a => 
          a.order_id === resolvedOrderId || 
          linkedProds.some(lp => lp.production_id === a.production_id)
        );
        for (const ma of matchingAssignments) {
          pushUpdate('editor_assignments', 'assignment_id', ma.assignment_id, {
            status: isClientAcc ? 'Client Acceptance' : 'Completed'
          }).catch(err => console.warn("[updateOrderStage] Editor assignment update warning:", err));
        }
        setEditorAssignments(prev => prev.map(a => 
          (a.order_id === resolvedOrderId || linkedProds.some(lp => lp.production_id === a.production_id))
            ? { ...a, status: (isClientAcc ? 'Client Acceptance' : 'Completed') as any }
            : a
        ));
      }
    }

    // Insert into lead_status_history if stage changed
    if (previousStage !== targetStageToSave) {
      const roleParts = (currentUserName && currentUserName.includes('|')) 
        ? currentUserName.split('|') 
        : [currentUserName || 'System', currentRole || 'System'];
      const changedBy = roleParts[0];
      const changedByRole = roleParts[1] || currentRole || 'System';

      const targetLeadId = targetOrder?.lead_id || (linkedProds[0] as any)?.lead_id || (resolvedOrderId.startsWith('LD') ? resolvedOrderId : null);

      const newHist = {
        lead_id: targetLeadId || resolvedOrderId,
        order_id: resolvedOrderId,
        old_status: previousStage,
        new_status: targetStageToSave,
        changed_by: changedBy,
        changed_by_role: changedByRole,
        remarks: `Order stage updated to ${targetStageToSave}`,
        created_at: timestamp
      };

      setStatusHistory(prev => [...prev, newHist as any]);
      pushInsert('lead_status_history', newHist).catch(err => console.warn("Failed to insert lead_status_history in updateOrderStage:", err));
    }

    fetchFromDb(false).catch(err => console.warn("[updateOrderStage] fetchFromDb sync notice:", err));

    logActivity(`Updated stage for Order ${orderId}`, 'Operations', orderId, previousStage, targetStageToSave);
  };

  // 7. Mark Delivered (Action button)
  const markDelivered = async (trackingId: string, remarks?: string) => {
    const targetFootage = rawFootage.find((rf) => rf.tracking_id === trackingId);
    if (!targetFootage) return;

    const orderId = targetFootage.order_id;
    const previousStage = augmentedOrders.find((o) => o.order_id === orderId)?.current_stage || 'Approved';

    const targetStage: CurrentStage = 'Closed';
    const timestamp = new Date().toISOString();

    const targetProd = augmentedProduction.find((p) => p.tracking_id === trackingId);
    if (targetProd) {
      const linkedOrder = augmentedOrders.find((o) => o.order_id === orderId);
      const orderName = linkedOrder?.package_name || 'Project';
      addNotification({
        user_id: targetProd.editor_assigned,
        project_id: targetProd.production_id,
        task_id: 'Delivery',
        notification_type: 'Project Delivered',
        title: 'Project Delivered to Client',
        message: `Project "${orderName}" (Order: ${orderId}) has been successfully delivered and completed.`,
        recipient_role: 'All'
      });
      addNotification({
        user_id: targetProd.editor_assigned,
        project_id: targetProd.production_id,
        task_id: 'Delivery',
        notification_type: 'Task Completed',
        title: 'Delivery Task Completed',
        message: `Delivery completed for "${orderName}" (Order: ${orderId}).`,
        recipient_role: 'Production Team'
      });
      addNotification({
        user_id: 'All',
        project_id: orderId,
        task_id: 'Delivery',
        notification_type: 'Project Delivered',
        title: '✅ Project Delivered',
        message: `Customer deliverables for "${orderName}" (Order: ${orderId}) have been completed and delivered successfully.`,
        recipient_role: 'Sales Team'
      });
      addNotification({
        user_id: 'All',
        project_id: orderId,
        task_id: 'Delivery',
        notification_type: 'Project Delivered',
        title: '✅ Project Delivered',
        message: `Customer deliverables for "${orderName}" (Order: ${orderId}) have been completed and delivered successfully.`,
        recipient_role: 'Business Owner'
      });
    }

    // Update production status
    if (targetProd) {
      const finalRemarks = `${targetProd.remarks || ''}\n${remarks || 'Delivered to client.'}`;
      const updates = {
        editing_status: 'Delivered',
        customer_review_status: 'Approved',
        delivery_date: timestamp.split('T')[0],
        remarks: finalRemarks
      };
       
        const rProd = await pushUpdate('production', 'production_id', targetProd.production_id, updates);
      if (!rProd?.success) {
        throw new Error("Failed to update production: " + rProd?.error);
      } else {
        setProduction(prev => prev.map(p => p.production_id === targetProd.production_id ? { ...p, ...updates } as any : p));
      }
    }

    // Update order & lead stage
    const rOrd = await pushUpdate('orders', 'order_id', orderId, { 
      current_stage: targetStage, 
      order_status: 'Delivered',
      updated_by: currentUserName,
      updated_at: timestamp
    });
    if (!rOrd?.success) {
      throw new Error("Failed to update order status: " + rOrd?.error);
    }

    setOrders(prev => prev.map(o => {
      if (o.order_id === orderId) {
        return {
          ...o,
          current_stage: targetStage,
          order_status: 'Delivered',
          updated_by: currentUserName,
          updated_at: timestamp
        };
      }
      return o;
    }));

    const tgtOrder = augmentedOrders.find((o) => o.order_id === orderId);
    if (tgtOrder) {
      const rLead = await pushUpdate('leads', 'lead_id', tgtOrder.lead_id, { 
        status: targetStage,
        current_status: targetStage,
        updated_by: currentUserName,
        updated_at: timestamp
      });
      if (!rLead?.success) {
        throw new Error("Failed to update lead status: " + rLead?.error);
      }

      setLeads(prev => prev.map(l => {
        if (l.lead_id === tgtOrder.lead_id) {
          return {
            ...l,
            status: targetStage,
            current_status: targetStage,
            updated_by: currentUserName,
            updated_at: timestamp
          };
        }
        return l;
      }));
    }

    //  // Disabled to prevent full reload

    logActivity(`Marked Project Delivered to client for Order: ${orderId}`, 'Production', trackingId, previousStage, targetStage);
  };

  // 8. Payments update
  const recordPayment = async (
    orderId: string, 
    amountReceived: number, 
    paymentDate: string, 
    proofUrl?: string,
    transactionId?: string,
    paymentMode?: string,
    paymentNotes?: string,
    paymentType?: string
  ) => {
    const cleanOrderId = String(orderId || '').trim();
    if (!cleanOrderId) throw new Error("Order ID is required to record payment.");

    const actualAmountReceived = Number(amountReceived) || 0;
    if (actualAmountReceived <= 0) throw new Error("Payment amount must be greater than zero.");

    // Resolve linked order to ensure accurate canonical Order ID mapping across all prefix aliases
    const matchingIdsList = getAllMatchingOrderIds(cleanOrderId, null, orders, leads);
    const matchingIdsSet = new Set(matchingIdsList);

    const linkedOrder = orders.find(o => 
      matchingIdsSet.has(o.order_id) || (o.lead_id && matchingIdsSet.has(o.lead_id))
    );
    const resolvedOrderId = linkedOrder?.order_id || cleanOrderId;
    const resolvedLeadId = linkedOrder?.lead_id || (cleanOrderId.startsWith('LD') ? cleanOrderId : undefined);

    const allResolvedIds = new Set(getAllMatchingOrderIds(resolvedOrderId, resolvedLeadId, orders, leads));

    let targetPayment = augmentedPayments.find((p) => 
      allResolvedIds.has(p.order_id) || (p.lead_id && allResolvedIds.has(p.lead_id))
    ) || payments.find(p => 
      allResolvedIds.has(p.order_id) || (p.lead_id && allResolvedIds.has(p.lead_id))
    );

    const resolvedProofUrl = proofUrl || 'https://photocrew-receipts.s3.amazonaws.com/rec-custom.pdf';
    const finalPaymentType = paymentType || (targetPayment as any)?.Payment_type || targetPayment?.payment_type || 'Event Date Payment';
    const cleanTxnId = (transactionId && typeof transactionId === 'string' && transactionId.trim() !== '' && transactionId.trim() !== 'N/A' && transactionId.trim() !== 'null' && transactionId.trim() !== 'NULL') ? transactionId.trim() : null;
    const resolvedTxnId = cleanTxnId !== null ? cleanTxnId : (targetPayment?.transaction_id || undefined);

    const resolvedPaymentDate = paymentDate 
      ? (paymentDate.includes('T') ? paymentDate : `${paymentDate}T${new Date().toTimeString().split(' ')[0]}`) 
      : new Date().toISOString();

    // 1. Ensure payments table has an entry with 'Waiting for Approval'
    if (targetPayment) {
      const rPay = await pushUpdate('payments', 'payment_id', targetPayment.payment_id, {
        payment_status: 'Waiting for Approval',
        transaction_id: resolvedTxnId,
        payment_type: finalPaymentType,
        Payment_type: finalPaymentType
      });
      if (!rPay?.success) {
        console.warn("[recordPayment] Warning updating payment in database:", rPay?.error);
      }

      if (supabaseClient) {
        try {
          await supabaseClient
            .from('payments')
            .update({
              payment_status: 'Waiting for Approval',
              transaction_id: resolvedTxnId,
              payment_type: finalPaymentType,
              Payment_type: finalPaymentType,
              updated_at: new Date().toISOString()
            })
            .eq('payment_id', targetPayment.payment_id);
        } catch (_) {}
      }

      setPayments(prev => {
        const exists = prev.some(p => p.payment_id === targetPayment.payment_id);
        const updatedPayment = {
          ...targetPayment,
          payment_status: 'Waiting for Approval' as PaymentStatus,
          transaction_id: resolvedTxnId,
          Payment_type: finalPaymentType,
          payment_type: finalPaymentType
        };
        if (exists) {
          return prev.map(p => p.payment_id === targetPayment.payment_id ? { ...p, ...updatedPayment } : p);
        }
        return [...prev, updatedPayment];
      });
    } else {
      const newPayId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
      const newPaymentRecord: Payment = {
        payment_id: newPayId,
        order_id: resolvedOrderId,
        quotation_amount: linkedOrder?.quotation_amount || actualAmountReceived,
        advance_received: 0,
        balance_due: Math.max(0, (linkedOrder?.quotation_amount || actualAmountReceived) - actualAmountReceived),
        final_payment_received: 0,
        payment_date: resolvedPaymentDate.split('T')[0],
        payment_status: 'Waiting for Approval',
        transaction_id: resolvedTxnId,
        payment_type: finalPaymentType,
        Payment_type: finalPaymentType
      };
      await pushInsert('payments', newPaymentRecord);
      if (supabaseClient) {
        try {
          await supabaseClient.from('payments').upsert(newPaymentRecord, { onConflict: 'payment_id' });
        } catch (_) {}
      }
      setPayments(prev => [...prev, newPaymentRecord]);
    }

    // 2. Build individual payment history transaction record
    // Check if the same payment already has an approval record (avoiding duplicates)
    const existingHist = cleanTxnId ? (paymentHistory || []).find(h => 
      allResolvedIds.has(String(h.order_id || '').trim()) && 
      h.transaction_id && String(h.transaction_id).trim() === cleanTxnId
    ) : null;

    const userNote = (paymentNotes && paymentNotes.trim()) ? paymentNotes.trim() : 'Recorded by Sales';
    const noteWithApprovalStatus = `${userNote} - Waiting for Approval`;
    const histIdToUse = existingHist ? (existingHist.id || existingHist.payment_history_id) : generateUUID();

    const historyItemPayload = {
      id: histIdToUse,
      order_id: resolvedOrderId,
      amount: actualAmountReceived,
      payment_date: resolvedPaymentDate,
      transaction_id: cleanTxnId || null,
      payment_mode: paymentMode || 'UPI',
      payment_type: finalPaymentType,
      updated_by: currentUserName || 'Sales',
      notes: noteWithApprovalStatus,
      approval_status: 'Waiting for Approval'
    };

    // 3. Save to database with self-healing proxy and direct verification
    let savedSuccessfully = false;
    if (existingHist) {
      const updRes = await pushUpdate('payment_history', 'id', histIdToUse, historyItemPayload);
      if (updRes?.success) savedSuccessfully = true;
    } else {
      const historySaveRes = await pushInsert('payment_history', historyItemPayload);
      if (historySaveRes?.success) savedSuccessfully = true;
    }

    if (supabaseClient) {
      const { data: verifiedHist, error: verifyErr } = await supabaseClient
        .from('payment_history')
        .select('*')
        .eq('id', histIdToUse)
        .maybeSingle();

      if (verifiedHist && !verifyErr) {
        savedSuccessfully = true;
      } else {
        // Direct upsert to ensure database persistence
        const { data: directData, error: directErr } = await supabaseClient
          .from('payment_history')
          .upsert(historyItemPayload, { onConflict: 'id' })
          .select();
        if (directErr) {
          throw new Error("Database save failed: " + directErr.message);
        }
        if (directData && directData.length > 0) {
          savedSuccessfully = true;
        }
      }
    }

    if (!savedSuccessfully) {
      throw new Error("Failed to save and verify payment in database. Please try again.");
    }

    // 4. Update local state and re-fetch authoritative records from database
    if (supabaseClient) {
      const { data: freshHistory } = await supabaseClient
        .from('payment_history')
        .select('*')
        .order('payment_date', { ascending: false });
      if (freshHistory && Array.isArray(freshHistory)) {
        setPaymentHistory(freshHistory);
      } else {
        setPaymentHistory(prev => {
          const filtered = prev.filter(h => h.id !== histIdToUse && h.payment_history_id !== histIdToUse);
          return [historyItemPayload, ...filtered];
        });
      }

      const { data: freshPayments } = await supabaseClient
        .from('payments')
        .select('*');
      if (freshPayments && Array.isArray(freshPayments)) {
        setPayments(freshPayments);
      }
    } else {
      setPaymentHistory(prev => {
        const filtered = prev.filter(h => h.id !== histIdToUse && h.payment_history_id !== histIdToUse);
        return [historyItemPayload, ...filtered];
      });
    }

    // 5. Update local storage for immediate multi-tab sync
    try {
      const saved = localStorage.getItem('pending_payment_approvals');
      const parsed = saved ? JSON.parse(saved) : [];
      const filtered = (Array.isArray(parsed) ? parsed : []).filter((p: any) => p.id !== histIdToUse && p.payment_history_id !== histIdToUse);
      filtered.unshift(historyItemPayload);
      localStorage.setItem('pending_payment_approvals', JSON.stringify(filtered));

      // Remove from rejected if it was previously rejected
      const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
      if (rejectedSaved) {
        const rejectedSet = new Set(JSON.parse(rejectedSaved));
        rejectedSet.delete(histIdToUse);
        localStorage.setItem('rejected_payment_history_ids', JSON.stringify(Array.from(rejectedSet)));
      }
    } catch (_) {}

    logActivity(`Submitted payment of ₹${actualAmountReceived} for Order ${resolvedOrderId} - Waiting for Approval`, 'Finance', resolvedOrderId);

    broadcastSyncPing();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('payment-updated', { detail: { orderId: resolvedOrderId } }));
      window.dispatchEvent(new CustomEvent('refresh-pending-payments', { detail: { orderId: resolvedOrderId } }));
    }
  };

  const approvePayment = async (historyId: string, orderId: string) => {
    let targetHistory = paymentHistory.find(h => 
      h.id === historyId || 
      h.payment_history_id === historyId || 
      String(h.id) === String(historyId) ||
      (h.transaction_id && String(h.transaction_id) === String(historyId))
    );
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(historyId);
    if (!targetHistory && supabaseClient && isUuid) {
      const { data } = await supabaseClient.from('payment_history').select('*').eq('id', historyId).maybeSingle();
      if (data) targetHistory = data;
    }

    const resolvedOrderId = orderId || targetHistory?.order_id || '';
    const allResolvedIds = new Set(getAllMatchingOrderIds(resolvedOrderId, targetHistory?.order_id, orders, leads));

    const rawNotes = (targetHistory?.notes || '')
      .replace(/ - Waiting for Approval/g, '')
      .replace(/Waiting for Approval/g, '')
      .replace(/ - Approved/g, '')
      .replace(/Approved by Business Owner/g, '')
      .replace(/ - Rejected/g, '')
      .replace(/Rejected by Business Owner/g, '')
      .trim();

    const cleanNotes = rawNotes ? `${rawNotes} - Approved` : 'Approved by Business Owner';

    const updatePayload = { 
      order_id: resolvedOrderId || targetHistory?.order_id,
      transaction_id: targetHistory?.transaction_id || undefined,
      approval_status: 'Approved',
      notes: cleanNotes
    };

    // 1. Direct Supabase update if client available
    if (supabaseClient && isUuid) {
      const { error: sbErr } = await supabaseClient
        .from('payment_history')
        .update(updatePayload)
        .eq('id', historyId);
      if (sbErr) {
        console.warn("[Direct Supabase Approval Update Warning]:", sbErr.message);
      }
    }

    // 2. Server API pushUpdate for persistence, self-healing & Google Sheets backup
    const res = await pushUpdate('payment_history', 'id', historyId, updatePayload);
    if (!res?.success && res?.error) {
      console.error("Failed to update approval in DB:", res.error);
      throw new Error(`Failed to approve payment: ${res.error}`);
    }

    // 3. Verify the updated row from database
    if (supabaseClient && isUuid) {
      try {
        const { data: verifiedData } = await supabaseClient
          .from('payment_history')
          .select('*')
          .eq('id', historyId)
          .maybeSingle();
        if (verifiedData) {
          targetHistory = { ...targetHistory, ...verifiedData };
        }
      } catch (_) {}
    }

    // 4. Update React payment history state
    setPaymentHistory(prev => prev.map(h => (h.id === historyId || h.payment_history_id === historyId || String(h.id) === String(historyId)) ? { ...h, approval_status: 'Approved', notes: cleanNotes } : h));

    // 5. Update local storage caches
    try {
      const saved = localStorage.getItem('pending_payment_approvals');
      if (saved) {
        const parsed = JSON.parse(saved);
        const filtered = (Array.isArray(parsed) ? parsed : []).filter((p: any) => 
          String(p.id) !== String(historyId) && String(p.payment_history_id) !== String(historyId)
        );
        localStorage.setItem('pending_payment_approvals', JSON.stringify(filtered));
      }

      const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
      if (rejectedSaved) {
        const rejectedSet = new Set(JSON.parse(rejectedSaved));
        rejectedSet.delete(historyId);
        if (targetHistory?.payment_history_id) rejectedSet.delete(targetHistory.payment_history_id);
        if (targetHistory?.id) rejectedSet.delete(targetHistory.id);
        localStorage.setItem('rejected_payment_history_ids', JSON.stringify(Array.from(rejectedSet)));
      }

      const approvedSaved = localStorage.getItem('approved_payment_history_ids');
      const approvedSet = new Set(approvedSaved ? JSON.parse(approvedSaved) : []);
      approvedSet.add(historyId);
      if (targetHistory?.payment_history_id) approvedSet.add(targetHistory.payment_history_id);
      if (targetHistory?.id) approvedSet.add(targetHistory.id);
      localStorage.setItem('approved_payment_history_ids', JSON.stringify(Array.from(approvedSet)));
    } catch (_) {}

    // 6. Recalculate parent order and payment status
    const amountToApply = Number(targetHistory?.amount) || 0;
    const targetPayment = augmentedPayments.find(p => allResolvedIds.has(p.order_id) || (p.lead_id && allResolvedIds.has(p.lead_id))) || payments.find(p => allResolvedIds.has(p.order_id) || (p.lead_id && allResolvedIds.has(p.lead_id)));
    const targetOrder = augmentedOrders.find(o => allResolvedIds.has(o.order_id) || (o.lead_id && allResolvedIds.has(o.lead_id))) || orders.find(o => allResolvedIds.has(o.order_id) || (o.lead_id && allResolvedIds.has(o.lead_id)));

    const updatedHistoryList = paymentHistory.map(h => 
      (h.id === historyId || h.payment_history_id === historyId || String(h.id) === String(historyId)) 
        ? { ...h, approval_status: 'Approved', notes: cleanNotes } 
        : h
    );

    const remainingPending = updatedHistoryList.some(h => 
      allResolvedIds.has(String(h.order_id || '').trim()) && 
      (String(h.id) !== String(historyId) && String(h.payment_history_id) !== String(historyId)) && 
      h.approval_status !== 'Rejected' &&
      (h.approval_status === 'Waiting for Approval' || (h.notes && h.notes.includes('Waiting for Approval')))
    );

    const approvedHistories = updatedHistoryList.filter(h => 
      allResolvedIds.has(String(h.order_id || '').trim()) && 
      h.approval_status !== 'Rejected' && 
      (h.approval_status === 'Approved' || (!h.notes || (!h.notes.includes('Waiting for Approval') && !h.notes.includes('Rejected'))))
    );

    const totalApprovedReceived = approvedHistories.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
    const quotationAmt = targetPayment?.quotation_amount || targetOrder?.quotation_amount || 0;
    const outstanding = Math.max(0, quotationAmt - totalApprovedReceived);
    const isFullyPaid = outstanding === 0 && quotationAmt > 0;

    const newPaymentStatus: PaymentStatus = remainingPending 
      ? 'Waiting for Approval' 
      : (isFullyPaid ? 'Fully Paid' : (totalApprovedReceived > 0 ? 'Partially Paid' : 'Pending'));

    if (targetPayment) {
      const isAdvance = targetHistory?.payment_type === 'Advance Payment' || (targetPayment.advance_received || 0) === 0;
      let newAdvance = Number(targetPayment.advance_received) || 0;
      let newFinal = Number(targetPayment.final_payment_received) || 0;

      if (isAdvance && newAdvance === 0) {
        newAdvance = Math.min(quotationAmt, totalApprovedReceived);
      } else {
        newFinal = Math.max(0, totalApprovedReceived - newAdvance);
      }

      if (newAdvance + newFinal !== totalApprovedReceived) {
        if (newAdvance === 0) newAdvance = Math.min(quotationAmt, totalApprovedReceived);
        else newFinal = Math.max(0, totalApprovedReceived - newAdvance);
      }

      const paymentUpdates = {
        advance_received: newAdvance,
        final_payment_received: newFinal,
        balance_due: outstanding,
        payment_status: newPaymentStatus
      };

      await pushUpdate('payments', 'payment_id', targetPayment.payment_id, paymentUpdates);
      setPayments(prev => prev.map(p => p.payment_id === targetPayment.payment_id ? { ...p, ...paymentUpdates } : p));
    }

    if (targetOrder) {
      await pushUpdate('orders', 'order_id', targetOrder.order_id, {
        balance_amount: outstanding,
        advance_received: totalApprovedReceived,
        updated_by: currentUserName,
        updated_at: new Date().toISOString()
      });
      setOrders(prev => prev.map(o => o.order_id === targetOrder.order_id ? { ...o, balance_amount: outstanding, advance_received: totalApprovedReceived } : o));
    }

    logActivity(`Approved payment of ₹${amountToApply} for Order ${resolvedOrderId}. Status: ${newPaymentStatus}`, 'Finance', resolvedOrderId);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('payment-updated', { detail: { orderId: resolvedOrderId } }));
      window.dispatchEvent(new CustomEvent('refresh-pending-payments', { detail: { orderId: resolvedOrderId } }));
    }
  };

  const rejectPayment = async (historyId: string, orderId: string) => {
    let targetHistory = paymentHistory.find(h => 
      h.id === historyId || 
      h.payment_history_id === historyId || 
      String(h.id) === String(historyId) ||
      (h.transaction_id && String(h.transaction_id) === String(historyId))
    );
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(historyId);
    if (!targetHistory && supabaseClient && isUuid) {
      const { data } = await supabaseClient.from('payment_history').select('*').eq('id', historyId).maybeSingle();
      if (data) targetHistory = data;
    }

    const resolvedOrderId = orderId || targetHistory?.order_id || '';
    const allResolvedIds = new Set(getAllMatchingOrderIds(resolvedOrderId, targetHistory?.order_id, orders, leads));

    // Strip previous status tags and append - Rejected
    const rawNotes = (targetHistory?.notes || '')
      .replace(/ - Waiting for Approval/g, '')
      .replace(/Waiting for Approval/g, '')
      .replace(/ - Approved/g, '')
      .replace(/Approved by Business Owner/g, '')
      .replace(/ - Rejected/g, '')
      .replace(/Rejected by Business Owner/g, '')
      .trim();

    const cleanNotes = rawNotes ? `${rawNotes} - Rejected` : 'Rejected by Business Owner';

    const updatePayload = { 
      order_id: resolvedOrderId || targetHistory?.order_id,
      approval_status: 'Rejected',
      notes: cleanNotes
    };

    // 1. Direct Supabase update if client available
    if (supabaseClient && isUuid) {
      const { error: sbErr } = await supabaseClient
        .from('payment_history')
        .update(updatePayload)
        .eq('id', historyId);
      if (sbErr) {
        console.warn("[Direct Supabase Rejection Update Warning]:", sbErr.message);
      }
    }

    // 2. Server API pushUpdate for persistence, self-healing & Google Sheets backup
    const res = await pushUpdate('payment_history', 'id', historyId, updatePayload);
    if (!res?.success && res?.error) {
      console.error("Failed to update rejection in DB:", res.error);
      throw new Error(`Failed to reject payment: ${res.error}`);
    }

    // 3. Update React payment history state
    setPaymentHistory(prev => prev.map(h => (h.id === historyId || h.payment_history_id === historyId || String(h.id) === String(historyId)) ? { ...h, approval_status: 'Rejected', notes: cleanNotes } : h));

    // 4. Update local storage caches
    try {
      const saved = localStorage.getItem('pending_payment_approvals');
      if (saved) {
        const parsed = JSON.parse(saved);
        const filtered = parsed.filter((p: any) => p.id !== historyId && p.payment_history_id !== historyId);
        localStorage.setItem('pending_payment_approvals', JSON.stringify(filtered));
      }

      const rejectedSaved = localStorage.getItem('rejected_payment_history_ids');
      const rejectedSet = new Set(rejectedSaved ? JSON.parse(rejectedSaved) : []);
      rejectedSet.add(historyId);
      if (targetHistory?.payment_history_id) rejectedSet.add(targetHistory.payment_history_id);
      if (targetHistory?.id) rejectedSet.add(targetHistory.id);
      localStorage.setItem('rejected_payment_history_ids', JSON.stringify(Array.from(rejectedSet)));

      const approvedSaved = localStorage.getItem('approved_payment_history_ids');
      if (approvedSaved) {
        const approvedSet = new Set(JSON.parse(approvedSaved));
        approvedSet.delete(historyId);
        if (targetHistory?.payment_history_id) approvedSet.delete(targetHistory.payment_history_id);
        if (targetHistory?.id) approvedSet.delete(targetHistory.id);
        localStorage.setItem('approved_payment_history_ids', JSON.stringify(Array.from(approvedSet)));
      }
    } catch (_) {}

    // 5. Recalculate parent order and payment status
    const updatedHistoryList = paymentHistory.map(h => 
      (h.id === historyId || h.payment_history_id === historyId || String(h.id) === String(historyId)) 
        ? { ...h, approval_status: 'Rejected', notes: cleanNotes } 
        : h
    );

    const targetPayment = augmentedPayments.find(p => allResolvedIds.has(p.order_id) || (p.lead_id && allResolvedIds.has(p.lead_id))) || payments.find(p => allResolvedIds.has(p.order_id) || (p.lead_id && allResolvedIds.has(p.lead_id)));
    const targetOrder = augmentedOrders.find(o => allResolvedIds.has(o.order_id) || (o.lead_id && allResolvedIds.has(o.lead_id))) || orders.find(o => allResolvedIds.has(o.order_id) || (o.lead_id && allResolvedIds.has(o.lead_id)));

    const remainingPending = updatedHistoryList.some(h => 
      allResolvedIds.has(String(h.order_id || '').trim()) && 
      (h.id !== historyId && h.payment_history_id !== historyId && String(h.id) !== String(historyId)) && 
      h.approval_status !== 'Rejected' &&
      (h.approval_status === 'Waiting for Approval' || (h.notes && h.notes.includes('Waiting for Approval')))
    );

    const approvedHistories = updatedHistoryList.filter(h => 
      allResolvedIds.has(String(h.order_id || '').trim()) && 
      h.approval_status !== 'Rejected' && 
      (h.approval_status === 'Approved' || (!h.notes || (!h.notes.includes('Waiting for Approval') && !h.notes.includes('Rejected'))))
    );

    const totalApprovedReceived = approvedHistories.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
    const quotationAmt = targetPayment?.quotation_amount || targetOrder?.quotation_amount || 0;
    const outstanding = Math.max(0, quotationAmt - totalApprovedReceived);
    const isFullyPaid = outstanding === 0 && quotationAmt > 0;

    const newPaymentStatus: PaymentStatus = remainingPending 
      ? 'Waiting for Approval' 
      : (isFullyPaid ? 'Fully Paid' : (totalApprovedReceived > 0 ? 'Partially Paid' : 'Pending'));

    if (targetPayment) {
      const paymentUpdates = {
        advance_received: Math.min(quotationAmt, totalApprovedReceived),
        final_payment_received: Math.max(0, totalApprovedReceived - Math.min(quotationAmt, totalApprovedReceived)),
        balance_due: outstanding,
        payment_status: newPaymentStatus
      };

      await pushUpdate('payments', 'payment_id', targetPayment.payment_id, paymentUpdates);
      setPayments(prev => prev.map(p => p.payment_id === targetPayment.payment_id ? { ...p, ...paymentUpdates } : p));
    }

    if (targetOrder) {
      await pushUpdate('orders', 'order_id', targetOrder.order_id, {
        balance_amount: outstanding,
        advance_received: totalApprovedReceived,
        updated_by: currentUserName,
        updated_at: new Date().toISOString()
      });
      setOrders(prev => prev.map(o => o.order_id === targetOrder.order_id ? { ...o, balance_amount: outstanding, advance_received: totalApprovedReceived } : o));
    }
    
    logActivity(`Rejected payment of ₹${Number(targetHistory?.amount || 0)} for Order ${resolvedOrderId}`, 'Finance', resolvedOrderId);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('payment-updated', { detail: { orderId: resolvedOrderId } }));
      window.dispatchEvent(new CustomEvent('refresh-pending-payments', { detail: { orderId: resolvedOrderId } }));
    }
  };

  // User Management Admin features
  const addUser = async (name: string, email: string, mobile: string, role: UserRole, active: boolean, password?: string, employee_id?: string) => {
    // Validate global mobile and email uniqueness
    const uniqueCheck = checkGlobalStaffUniqueness({
      mobile,
      email: (email && email.trim() !== '') ? email.trim() : undefined,
      excludeId: null,
      usersList: users,
      opStaffList: staff,
      prodStaffList: productionStaff
    });
    if (!uniqueCheck.isUnique) {
      throw new Error(uniqueCheck.error);
    }

    const newId = crypto.randomUUID ? crypto.randomUUID() : `U-${Math.floor(1000 + Math.random() * 9000)}`;
    const safeEmail = (email && email.trim() !== '') ? email.trim().toLowerCase() : `${mobile ? mobile.replace(/[^a-zA-Z0-9]/g, '') : 'user'}_${newId.substring(0,6)}@photocrew.com`;
    const safeUsername = safeEmail.split('@')[0];
    
    // Create via server admin endpoint to ensure Supabase Auth and public.users sync
    let finalAuthId = newId;
    if (password) {
      try {
        const authRes = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: safeEmail,
            password: password,
            name: name,
            role: role,
            mobile: mobile,
            active: active
          })
        });
        const authData = await authRes.json();
        if (authData.success && authData.data?.user?.id) {
          finalAuthId = authData.data.user.id;
        } else if (!authData.success && authData.error) {
          throw new Error(authData.error);
        }
      } catch (authErr: any) {
        console.warn("Server auth create user error:", authErr);
        if (authErr?.message) {
          throw authErr;
        }
      }
    }

    const newUser = {
      id: finalAuthId,
      name,
      mobile,
      email: safeEmail,
      role,
      active,
      created_at: new Date().toISOString(),
      password,
      username: safeUsername,
      employee_id
    };
    
    // Save to Supabase using pushUpsert
    const dbRes = await pushUpsert('users', { ...newUser, id: mapToDbUserId(finalAuthId) });
    if (!dbRes.success) {
      if (dbRes.error && dbRes.error.includes('users_email_key')) {
        throw new Error("This email address is already registered.");
      }
      throw new Error(dbRes.error || "Failed to save user to database");
    }
    
    setUsers((prev) => [...prev, newUser]);
    logActivity(`Added New User Account: ${name} (${role})`, 'UserManagement', finalAuthId);
  };

  const signUpUser = async (name: string, username: string, email: string, mobile: string, role: UserRole, password: string) => {
    throw new Error('User registration is disabled. Only pre-configured system accounts are permitted.');
  };

  const editUser = async (id: string, updates: { name: string, email?: string, mobile?: string, role?: UserRole, active: boolean, employee_id?: string, password?: string }) => {
    const dbUserId = mapToDbUserId(id);
    let targetUser = users.find(u => u.id === id || mapToDbUserId(u.id) === dbUserId || u.id === dbUserId);
    
    if (!targetUser && supabaseClient) {
      try {
        const { data: fetchedUser } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', dbUserId)
          .maybeSingle();
        if (fetchedUser) {
          targetUser = mapUserFieldsFromDb(fetchedUser);
        }
      } catch (fetchErr) {
        console.warn("Error fetching user in editUser:", fetchErr);
      }
    }

    // Validate global uniqueness if mobile or email is being modified
    const candidateMobile = updates.mobile !== undefined ? updates.mobile : targetUser?.mobile;
    const candidateEmail = updates.email !== undefined ? updates.email : targetUser?.email;
    const uniqueCheck = checkGlobalStaffUniqueness({
      mobile: candidateMobile,
      email: candidateEmail,
      excludeId: id,
      excludeEmail: targetUser?.email,
      excludeMobile: targetUser?.mobile,
      usersList: users,
      opStaffList: staff,
      prodStaffList: productionStaff
    });
    if (!uniqueCheck.isUnique) {
      throw new Error(uniqueCheck.error);
    }

    const safeName = updates.name !== undefined ? updates.name : (targetUser?.name || '');
    const safeEmail = (updates.email && updates.email.trim() !== '') ? updates.email.trim() : (targetUser?.email || `${(updates.mobile || targetUser?.mobile || 'user').replace(/[^a-zA-Z0-9]/g, '')}_${id.substring(0,6)}@photocrew.com`);
    const safeMobile = updates.mobile !== undefined ? updates.mobile : (targetUser?.mobile || '');
    const safeRole = updates.role || targetUser?.role || 'Sales Team';
    const safeActive = updates.active !== undefined ? (updates.active !== false && updates.active !== 'false') : (targetUser?.active ?? true);
    const safeEmployeeId = updates.employee_id !== undefined ? updates.employee_id : (targetUser?.employee_id || '');
    const cleanPassword = updates.password ? updates.password.trim() : (targetUser?.password || '');

    // Note: public.users has columns: id, name, email, mobile, role, password, active. (employee_id is not a column on public.users)
    const dbPayload: any = {
      name: safeName,
      active: safeActive,
      role: safeRole
    };
    if (safeEmail) dbPayload.email = safeEmail;
    if (safeMobile) dbPayload.mobile = safeMobile;
    if (cleanPassword) dbPayload.password = cleanPassword;

    // 1. Direct Supabase update
    if (supabaseClient) {
      try {
        await supabaseClient.from('users').update(dbPayload).eq('id', dbUserId);
        if (targetUser?.email && targetUser.email !== safeEmail) {
          await supabaseClient.from('users').update(dbPayload).ilike('email', targetUser.email.trim());
        }
        if (targetUser?.mobile && targetUser.mobile !== safeMobile) {
          await supabaseClient.from('users').update(dbPayload).eq('mobile', targetUser.mobile.trim());
        }
      } catch (sbErr) {
        console.warn("Direct Supabase update warning in editUser:", sbErr);
      }
    }

    // 2. Sync with auth server
    try {
      await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_id: dbUserId,
          email: safeEmail,
          mobile: safeMobile,
          name: safeName,
          role: safeRole,
          active: safeActive,
          ...(cleanPassword ? { password: cleanPassword } : {})
        })
      });
    } catch (authErr) {
      console.warn("Auth update user error in editUser:", authErr);
    }

    // 3. Update via pushUpdate / server proxy
    const dbRes = await pushUpdate('users', 'id', dbUserId, dbPayload);
    if (!dbRes.success) {
      if (dbRes.error && dbRes.error.includes('users_email_key')) {
        throw new Error("This email address is already in use by another user.");
      }
      console.warn("pushUpdate users warning in editUser:", dbRes.error);
    }

    // 4. Update memory state
    setUsers((prev) => prev.map((u) => {
      if (u.id === id || mapToDbUserId(u.id) === dbUserId || u.id === dbUserId) {
        return {
          ...u,
          name: safeName,
          email: safeEmail,
          mobile: safeMobile,
          role: safeRole,
          active: safeActive,
          password: cleanPassword,
          employee_id: safeEmployeeId
        };
      }
      return u;
    }));

    const updatedUserObj = {
      ...targetUser,
      ...dbPayload,
      employee_id: safeEmployeeId,
      id: targetUser?.id || id
    };

    setUsers((prev) => prev.map((u) => {
      const match = u.id === id || 
                    mapToDbUserId(u.id) === dbUserId || 
                    u.id === dbUserId ||
                    (targetUser?.email && u.email && u.email.toLowerCase() === targetUser.email.toLowerCase()) ||
                    (targetUser?.mobile && u.mobile && u.mobile === targetUser.mobile);
      return match ? { ...u, ...updatedUserObj } : u;
    }));

    logActivity(`Updated User Account Profile: ${safeName}`, 'UserManagement', id);
    try {
      broadcastSyncPing();
      fetchFromDb(false);
    } catch (e) {}
  };

  const deleteUser = async (id: string) => {
    let targetUser = users.find(u => u.id === id);
    if (!targetUser) return;
    
    try {
      const { error } = await supabaseClient.from('users').delete().eq('id', mapToDbUserId(id));
      if (error) throw error;
    } catch (e: any) {
      console.error("Failed to delete from DB", e);
      throw new Error(e.message || "Failed to delete user from database");
    }
    
    setUsers((prev) => prev.filter(u => u.id !== id));
    logActivity(`Deleted User Account: ${targetUser.name}`, 'UserManagement', id);
  };

  const toggleUserStatus = async (id: string) => {
    const dbUserId = mapToDbUserId(id);
    let targetUser = users.find(u => u.id === id || mapToDbUserId(u.id) === dbUserId || u.id === dbUserId);
    
    // Always fetch fresh state from the live database first to ensure toggle direction is accurate
    let currentActive = targetUser ? (targetUser.active !== false && targetUser.active !== 'false') : false;
    try {
      const srvRes = await fetch('/api/db/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'users', matchColumn: 'id', matchValue: dbUserId })
      });
      const srvData = await srvRes.json();
      if (srvData.success && srvData.data?.[0]) {
        currentActive = srvData.data[0].active !== false && srvData.data[0].active !== 'false';
        if (!targetUser) {
          targetUser = mapUserFieldsFromDb(srvData.data[0]);
        }
      }
    } catch (fetchErr) {
      console.warn("Live DB select error in toggleUserStatus:", fetchErr);
    }

    if (!targetUser && supabaseClient) {
      try {
        const { data: fetchedUser } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', dbUserId)
          .maybeSingle();
        if (fetchedUser) {
          targetUser = mapUserFieldsFromDb(fetchedUser);
          currentActive = fetchedUser.active !== false && fetchedUser.active !== 'false';
        }
      } catch (fetchErr) {
        console.warn("Error fetching user in toggleUserStatus:", fetchErr);
      }
    }
    
    if (!targetUser) return;
    const nextActive = !currentActive;
    
    // 1. Direct update in public.users table for immediate persistence
    if (supabaseClient) {
      try {
        await supabaseClient.from('users').update({ active: nextActive }).eq('id', dbUserId);
      } catch (sbErr) {
        console.warn("Direct Supabase update warning in toggleUserStatus:", sbErr);
      }
    }

    // 2. Also update in users table via server proxy with service role
    try {
      await fetch('/api/db/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'users', matchColumn: 'id', matchValue: dbUserId, updates: { active: nextActive } })
      });
    } catch (pushErr) {
      console.warn("Server db/update active warning in toggleUserStatus:", pushErr);
    }

    // 3. Also update via server auth admin endpoint
    try {
      await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_id: dbUserId,
          active: nextActive
        })
      });
    } catch (authErr) {
      console.warn("Server auth active status sync warning in toggleUserStatus:", authErr);
    }
    
    // 4. Update in-memory users state across all matching keys immediately
    setUsers((prev) => prev.map((u) => {
      const match = u.id === id || 
                    mapToDbUserId(u.id) === dbUserId || 
                    u.id === dbUserId ||
                    (targetUser?.email && u.email && u.email.toLowerCase() === targetUser.email.toLowerCase()) ||
                    (targetUser?.mobile && u.mobile && u.mobile === targetUser.mobile);
      return match ? { ...u, active: nextActive } : u;
    }));

    logActivity(`${nextActive ? 'Activated' : 'Deactivated'} User Account: ${targetUser.name}`, 'UserManagement', id);

    try {
      broadcastSyncPing();
      fetchFromDb(false);
    } catch (e) {}
  };

  const resetUserPassword = async (id: string, newPassword: string) => {
    const cleanPassword = newPassword.trim();
    const dbUserId = mapToDbUserId(id);
    
    // Find target user in state or database
    let targetUser = users.find(u => u.id === id || mapToDbUserId(u.id) === dbUserId || u.id === dbUserId);
    
    if (!targetUser && supabaseClient) {
      try {
        const { data: fetchedUser } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', dbUserId)
          .maybeSingle();
        if (fetchedUser) {
          targetUser = mapUserFieldsFromDb(fetchedUser);
        }
      } catch (fetchErr) {
        console.warn("Error fetching user for password reset:", fetchErr);
      }
    }

    // 1. Direct update in public.users table for immediate persistence
    if (supabaseClient) {
      try {
        await supabaseClient.from('users').update({ password: cleanPassword }).eq('id', dbUserId);
        if (targetUser?.email) {
          await supabaseClient.from('users').update({ password: cleanPassword }).ilike('email', targetUser.email.trim());
        }
        if (targetUser?.mobile) {
          await supabaseClient.from('users').update({ password: cleanPassword }).eq('mobile', targetUser.mobile.trim());
        }
      } catch (directSbErr) {
        console.warn("Direct Supabase update warning in resetUserPassword:", directSbErr);
      }
    }
    
    // 2. Also update in users table via server proxy
    try {
      await pushUpdate('users', 'id', dbUserId, { password: cleanPassword });
    } catch (pushErr) {
      console.warn("pushUpdate users password warning:", pushErr);
    }
    
    // 3. Also update Supabase Auth via server admin endpoint
    try {
      await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_id: dbUserId,
          email: targetUser?.email,
          mobile: targetUser?.mobile,
          password: cleanPassword,
          name: targetUser?.name,
          role: targetUser?.role
        })
      });
    } catch (authErr) {
      console.warn("Supabase Auth password update warning:", authErr);
    }

    setUsers((prev) => prev.map((u) => (u.id === id || mapToDbUserId(u.id) === dbUserId || u.id === dbUserId) ? { ...u, password: cleanPassword } : u));

    // 4. If target is a Production Staff, guarantee production_staff.Password is updated in database
    try {
      const matchingProdStaff = productionStaff.find(ps => {
        if (ps.staff_id === id || ps.staff_id === dbUserId) return true;
        if (targetUser?.email && ps.email && ps.email.trim().toLowerCase() === targetUser.email.trim().toLowerCase()) return true;
        if (targetUser?.mobile && ps.mobile && cleanPhone(ps.mobile) === cleanPhone(targetUser.mobile)) return true;
        return false;
      });

      if (matchingProdStaff) {
        await pushUpdate('production_staff', 'staff_id', matchingProdStaff.staff_id, {
          Password: cleanPassword,
          password: cleanPassword
        });
        setProductionStaff(prev => prev.map(ps => ps.staff_id === matchingProdStaff.staff_id ? { ...ps, password: cleanPassword, Password: cleanPassword } : ps));
      } else if (targetUser?.mobile || targetUser?.email) {
        if (targetUser?.mobile) {
          await pushUpdate('production_staff', 'mobile', targetUser.mobile.trim(), { Password: cleanPassword, password: cleanPassword }).catch(() => null);
        }
        if (targetUser?.email) {
          await pushUpdate('production_staff', 'email', targetUser.email.trim(), { Password: cleanPassword, password: cleanPassword }).catch(() => null);
        }
      }
    } catch (prodErr) {
      console.warn("resetUserPassword sync to production_staff warning:", prodErr);
    }

    logActivity(`Reset Password for User account: ${targetUser?.name || id}`, 'UserManagement', id);
  };

  const addStaff = async (member: Omit<Staff, "staff_id">) => {
    // Validate global mobile and email uniqueness
    const uniqueCheck = checkGlobalStaffUniqueness({
      mobile: member.mobile,
      email: member.email,
      excludeId: null,
      usersList: users,
      opStaffList: staff,
      prodStaffList: productionStaff
    });
    if (!uniqueCheck.isUnique) {
      throw new Error(uniqueCheck.error);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const staffId = (member as any).staff_id && uuidRegex.test(String((member as any).staff_id))
      ? (member as any).staff_id
      : (crypto.randomUUID ? crypto.randomUUID() : `55555555-5555-5555-5555-${Math.floor(100000000000 + Math.random() * 900000000000)}`);

    const allowedOpsRoles = ['Photographer', 'Videographer', 'Assistant', 'Manager'];
    let safeRole = member.role || 'Photographer';
    if (!allowedOpsRoles.includes(safeRole)) {
      const rLower = String(safeRole).toLowerCase();
      if (rLower.includes('video')) safeRole = 'Videographer';
      else if (rLower.includes('assist')) safeRole = 'Assistant';
      else if (rLower.includes('manag')) safeRole = 'Manager';
      else safeRole = 'Photographer';
    }

    const cleanWhatsapp = member.whatsapp_number
      ? Number(String(member.whatsapp_number).replace(/\D/g, '').slice(-10))
      : (member.mobile ? Number(cleanPhone(member.mobile)) : null);

    const timestamp = new Date().toISOString();
    const newStaff: Staff = {
      ...member,
      staff_id: staffId,
      role: safeRole as any,
      whatsapp_number: cleanWhatsapp as any,
      created_by: currentUserName,
      updated_by: currentUserName,
      created_at: timestamp,
      updated_at: timestamp
    };
    setStaff((prev) => [newStaff, ...prev]);
    const res = await pushInsert('operations_staff', newStaff);
    if (res.success) {
      logActivity(`Added Staff Member: ${newStaff.name}`, 'StaffManagement', staffId);
      if ((member as any).password && typeof (member as any).password === 'string' && (member as any).password.trim()) {
        const pwd = (member as any).password.trim();
        const emailVal = (member.email || '').trim().toLowerCase() || `${member.mobile ? member.mobile.replace(/\D/g, '') : 'staff'}@photocrew.com`;
        try {
          // Sync via auth endpoint
          await fetch('/api/auth/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              staff_id: staffId,
              email: emailVal,
              password: pwd,
              name: member.name,
              role: 'Operation Staff',
              mobile: member.mobile,
              active: member.status !== 'Inactive'
            })
          });

          // Sync into memory users list
          setUsers((prev) => {
            const cleanM = cleanPhone(member.mobile);
            const exists = prev.some(u => (cleanM && cleanPhone(u.mobile) === cleanM) || (u.email && u.email.toLowerCase() === emailVal));
            if (exists) {
              return prev.map(u => {
                if ((cleanM && cleanPhone(u.mobile) === cleanM) || (u.email && u.email.toLowerCase() === emailVal)) {
                  return { ...u, name: member.name, mobile: member.mobile, password: pwd, role: 'Operation Staff' };
                }
                return u;
              });
            }
            return [...prev, {
              id: staffId,
              name: member.name,
              mobile: member.mobile,
              email: emailVal,
              username: emailVal,
              role: 'Operation Staff',
              active: member.status !== 'Inactive',
              password: pwd,
              created_at: new Date().toISOString()
            }];
          });
        } catch (err) {
          console.warn("addStaff password sync to users table warning:", err);
        }
      }
    } else {
      // Revert optimistic update if failed
      setStaff((prev) => prev.filter(s => s.staff_id !== staffId));
      throw new Error(res.error || 'Failed to add staff');
    }
    return res;
  };

  const updateStaff = async (staffId: string, updates: Partial<Staff>) => {
    const prevStaff = [...staff];
    const existing = staff.find(s => s.staff_id === staffId);
    const timestamp = new Date().toISOString();
    
    // Strip mobile and email so they can never be modified after staff creation
    const { mobile, phone, mobile_number, email, ...safeUpdates } = updates as any;

    const updatedWithMetadata = {
      ...safeUpdates,
      ...(existing?.mobile ? { mobile: existing.mobile } : {}),
      ...(existing?.email ? { email: existing.email } : {}),
      updated_by: currentUserName,
      updated_at: timestamp
    };
    setStaff((prev) => prev.map((s) => s.staff_id === staffId ? { ...s, ...updatedWithMetadata } : s));
    
    const dbPayload = { ...safeUpdates, updated_by: currentUserName, updated_at: timestamp };
    delete (dbPayload as any).mobile;
    delete (dbPayload as any).phone;
    delete (dbPayload as any).mobile_number;
    delete (dbPayload as any).email;

    const res = await pushUpdate('operations_staff', 'staff_id', staffId, dbPayload);
    if (res.success) {
      logActivity(`Updated Staff Member details: ${staffId}`, 'StaffManagement', staffId);
      if ((updates as any).password && typeof (updates as any).password === 'string' && (updates as any).password.trim()) {
        const pwd = (updates as any).password.trim();
        const targetMobile = existing?.mobile;
        const targetEmail = (existing?.email || '').trim().toLowerCase();
        try {
          if (targetMobile) {
            await pushUpdate('users', 'mobile', targetMobile, { password: pwd });
          }
          if (targetEmail) {
            await pushUpdate('users', 'email', targetEmail, { password: pwd });
          }
          setUsers((prev) => prev.map(u => {
            const cleanM = cleanPhone(targetMobile);
            if ((cleanM && cleanPhone(u.mobile) === cleanM) || (targetEmail && u.email && u.email.toLowerCase() === targetEmail)) {
              return { ...u, password: pwd };
            }
            return u;
          }));
        } catch (err) {
          console.warn("updateStaff password sync warning:", err);
        }
      }
    } else {
      // Revert optimistic update if failed
      setStaff(prevStaff);
      throw new Error(res.error || 'Failed to update staff');
    }
    return res;
  };

  const deleteStaff = async (staffId: string) => {
    const prevStaff = [...staff];
    const target = staff.find((s) => s.staff_id === staffId);
    setStaff((prev) => prev.filter((s) => s.staff_id !== staffId));
    try {
      await pushDelete('operations_staff', 'staff_id', staffId);
      
      // Cleanup corresponding user record and authentication
      const targetMobile = target?.mobile ? cleanPhone(target.mobile) : null;
      const targetEmail = target?.email ? cleanEmail(target.email) : null;
      const targetAuthId = (target as any)?.auth_user_id || null;

      try {
        await pushDelete('users', 'id', staffId);
        if (targetAuthId) {
          await pushDelete('users', 'id', targetAuthId);
        }
        if (targetEmail) {
          await pushDelete('users', 'email', targetEmail);
        }
        if (targetMobile && targetMobile.length >= 7) {
          await pushDelete('users', 'mobile', targetMobile);
        }
      } catch (_) {}

      // Delete from server auth endpoint
      try {
        await fetch('/api/auth/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: staffId,
            auth_id: targetAuthId,
            email: targetEmail,
            mobile: targetMobile
          })
        });
      } catch (_) {}

      // Cleanup local users state
      setUsers((prev) => prev.filter(u => {
        if (u.id === staffId || (targetAuthId && u.id === targetAuthId)) return false;
        if (targetMobile && cleanPhone(u.mobile) === targetMobile) return false;
        if (targetEmail && cleanEmail(u.email) === targetEmail) return false;
        return true;
      }));

      logActivity(`Removed Staff Member: ${staffId}`, 'StaffManagement', staffId);
    } catch (err: any) {
      setStaff(prevStaff);
      throw new Error(err.message || 'Failed to delete staff');
    }
  };

  const addProductionStaff = async (member: Omit<Staff, "staff_id">) => {
    // Validate global mobile and email uniqueness
    const uniqueCheck = checkGlobalStaffUniqueness({
      mobile: member.mobile,
      email: member.email,
      excludeId: null,
      usersList: users,
      opStaffList: staff,
      prodStaffList: productionStaff
    });
    if (!uniqueCheck.isUnique) {
      throw new Error(uniqueCheck.error);
    }

    const staffId = `STF-${Math.floor(10000 + Math.random() * 90000)}`;
    const timestamp = new Date().toISOString();
    const pwd = ((member as any).password || (member as any).Password || '').trim();
    const newStaff: Staff = {
      ...member,
      staff_id: staffId,
      password: pwd,
      Password: pwd,
      created_by: currentUserName,
      updated_by: currentUserName,
      created_at: timestamp,
      updated_at: timestamp
    };

    setProductionStaff((prev) => [newStaff, ...prev]);

    const dbPayload = await mapProductionStaffToDb(newStaff);
    if (pwd) {
      dbPayload.Password = pwd;
      dbPayload.password = pwd;
    }
    const res = await pushInsert('production_staff', dbPayload);
    if (res.success) {
      logActivity(`Added Production Staff Member: ${newStaff.name}`, 'StaffManagement', staffId);
      if (pwd) {
        const emailVal = (member.email || '').trim().toLowerCase() || `${member.mobile ? member.mobile.replace(/\D/g, '') : 'staff'}@photocrew.com`;
        try {
          // Sync via auth server endpoint with role 'Production Staff'
          await fetch('/api/auth/create-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              staff_id: staffId,
              email: emailVal,
              password: pwd,
              name: member.name,
              role: 'Production Staff',
              mobile: member.mobile,
              active: member.status !== 'Inactive'
            })
          });

          // Sync into memory users list
          setUsers((prev) => {
            const cleanM = cleanPhone(member.mobile);
            const exists = prev.some(u => (cleanM && cleanPhone(u.mobile) === cleanM) || (u.email && u.email.toLowerCase() === emailVal));
            if (exists) {
              return prev.map(u => {
                if ((cleanM && cleanPhone(u.mobile) === cleanM) || (u.email && u.email.toLowerCase() === emailVal)) {
                  return { ...u, name: member.name, mobile: member.mobile, password: pwd, role: 'Production Staff' };
                }
                return u;
              });
            }
            return [...prev, {
              id: staffId,
              name: member.name,
              mobile: member.mobile,
              email: emailVal,
              username: emailVal,
              role: 'Production Staff',
              active: member.status !== 'Inactive',
              password: pwd,
              created_at: new Date().toISOString()
            }];
          });
        } catch (err) {
          console.warn("addProductionStaff password sync to users table warning:", err);
        }
      }
    } else {
      setProductionStaff((prev) => prev.filter(s => s.staff_id !== staffId));
      throw new Error(res.error || 'Failed to add production staff');
    }
    return res;
  };

  const updateProductionStaff = async (staffId: string, updates: Partial<Staff>) => {
    const prevStaffList = [...productionStaff];
    const existing = productionStaff.find(s => s.staff_id === staffId);
    const timestamp = new Date().toISOString();
    
    // Strip mobile and email so they can never be modified after staff creation
    const { mobile, phone, mobile_number, email, ...safeUpdates } = updates as any;

    const updatedWithMetadata = {
      ...safeUpdates,
      ...(existing?.mobile ? { mobile: existing.mobile } : {}),
      ...(existing?.email ? { email: existing.email } : {}),
      updated_by: currentUserName,
      updated_at: timestamp
    };

    setProductionStaff((prev) => prev.map((s) => s.staff_id === staffId ? { ...s, ...updatedWithMetadata } : s));

    const dbPayload = { ...safeUpdates, updated_by: currentUserName, updated_at: timestamp };
    delete (dbPayload as any).mobile;
    delete (dbPayload as any).phone;
    delete (dbPayload as any).mobile_number;
    delete (dbPayload as any).email;

    const pwd = ((updates as any).password || (updates as any).Password || '').trim();
    if (pwd) {
      (updatedWithMetadata as any).password = pwd;
      (updatedWithMetadata as any).Password = pwd;
      (dbPayload as any).password = pwd;
      (dbPayload as any).Password = pwd;
    }

    const dbUpdates = await mapProductionStaffToDb(dbPayload);
    delete (dbUpdates as any).mobile;
    delete (dbUpdates as any).phone;
    delete (dbUpdates as any).mobile_number;
    delete (dbUpdates as any).email;
    if (pwd) {
      dbUpdates.Password = pwd;
      dbUpdates.password = pwd;
    }

    const res = await pushUpdate('production_staff', 'staff_id', staffId, dbUpdates);
    if (res.success) {
      logActivity(`Updated Production Staff Member details: ${staffId}`, 'StaffManagement', staffId);
      if (pwd) {
        const targetMobile = existing?.mobile;
        const targetEmail = (existing?.email || '').trim().toLowerCase();
        try {
          if (targetMobile) {
            await pushUpdate('users', 'mobile', targetMobile, { password: pwd, role: 'Production Staff' });
          }
          if (targetEmail) {
            await pushUpdate('users', 'email', targetEmail, { password: pwd, role: 'Production Staff' });
          }
          // Also sync to auth if auth_user_id exists
          const authId = (existing as any)?.auth_user_id || (existing?.notes && existing.notes.includes('auth_user_id') ? JSON.parse(existing.notes).auth_user_id : null);
          if (authId) {
            await fetch('/api/auth/update-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auth_id: authId,
                password: pwd,
                role: 'Production Staff'
              })
            }).catch(() => null);
          }
          setUsers((prev) => prev.map(u => {
            const cleanM = cleanPhone(targetMobile);
            if ((cleanM && cleanPhone(u.mobile) === cleanM) || (targetEmail && u.email && u.email.toLowerCase() === targetEmail)) {
              return { ...u, password: pwd, role: 'Production Staff' };
            }
            return u;
          }));
        } catch (err) {
          console.warn("updateProductionStaff password sync warning:", err);
        }
      }
    } else {
      setProductionStaff(prevStaffList);
      throw new Error(res.error || 'Failed to update production staff');
    }
    return res;
  };

  const deleteProductionStaff = async (staffId: string) => {
    const prevStaffList = [...productionStaff];
    const target = productionStaff.find((s) => s.staff_id === staffId);
    setProductionStaff((prev) => prev.filter((s) => s.staff_id !== staffId));
    const res = await pushDelete('production_staff', 'staff_id', staffId);
    if (res.success) {
      // Cleanup corresponding user record and authentication
      const targetMobile = target?.mobile ? cleanPhone(target.mobile) : null;
      const targetEmail = target?.email ? cleanEmail(target.email) : null;
      const targetAuthId = (target as any)?.auth_user_id || null;

      try {
        await pushDelete('users', 'id', staffId);
        if (targetAuthId) {
          await pushDelete('users', 'id', targetAuthId);
        }
        if (targetEmail) {
          await pushDelete('users', 'email', targetEmail);
        }
        if (targetMobile && targetMobile.length >= 7) {
          await pushDelete('users', 'mobile', targetMobile);
        }
      } catch (_) {}

      // Delete from server auth endpoint
      try {
        await fetch('/api/auth/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: staffId,
            auth_id: targetAuthId,
            email: targetEmail,
            mobile: targetMobile
          })
        });
      } catch (_) {}

      // Cleanup local users state
      setUsers((prev) => prev.filter(u => {
        if (u.id === staffId || (targetAuthId && u.id === targetAuthId)) return false;
        if (targetMobile && cleanPhone(u.mobile) === targetMobile) return false;
        if (targetEmail && cleanEmail(u.email) === targetEmail) return false;
        return true;
      }));

      logActivity(`Deleted Production Staff Member: ${staffId}`, 'StaffManagement', staffId);
    } else {
      setProductionStaff(prevStaffList);
      throw new Error(res.error || 'Failed to delete production staff');
    }
    return res;
  };

  const addEquipment = async (equip: Omit<Equipment, 'equipment_id'>) => {
    const equipmentId = `EQ-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();
    const newEquip: Equipment = {
      ...equip,
      equipment_id: equipmentId,
      created_at: now,
      updated_at: now,
      created_by: currentUserName || 'System',
      updated_by: currentUserName || 'System',
      available_quantity: equip.available_quantity ?? equip.quantity
    };
    
    // Optimistic Update
    setEquipment((prev) => [newEquip, ...prev]);
    
    const res = await pushInsert('equipment', newEquip);
    if (res.success) {
      logActivity(`Registered New Studio Gear: ${newEquip.equipment_name}`, 'EquipmentManagement', equipmentId);
    } else {
      // Revert if failed
      setEquipment((prev) => prev.filter(e => e.equipment_id !== equipmentId));
      throw new Error(res.error || 'Failed to register equipment');
    }
    return res;
  };

  const updateEquipment = async (equipmentId: string, updates: Partial<Equipment>) => {
    const prevEquipment = [...equipment];
    const now = new Date().toISOString();
    const updatedFields = {
      ...updates,
      updated_at: now,
      updated_by: currentUserName || 'System'
    };

    setEquipment((prev) => prev.map((e) => e.equipment_id === equipmentId ? { ...e, ...updatedFields } : e));
    
    const res = await pushUpdate('equipment', 'equipment_id', equipmentId, updatedFields);
    if (res.success) {
      logActivity(`Updated Studio Gear: ${equipmentId}`, 'EquipmentManagement', equipmentId);
    } else {
      setEquipment(prevEquipment);
      throw new Error(res.error || 'Failed to update equipment');
    }
    return res;
  };

  const deleteEquipment = async (equipmentId: string) => {
    // Check if equipment is assigned
    // In this app, equipment might be linked to equipment_handovers or operations
    // For now, let's just implement the delete with a check if needed by the user
    // The user said: "If equipment is currently assigned to an event, prevent deletion and display a meaningful error message."
    
    const isAssigned = operations.some(op => op.equipment_kit && op.equipment_kit.includes(equipmentId)) || 
                       equipmentHandovers.some(h => h.equipment_name && h.equipment_name.includes(equipmentId) && h.return_status === 'Not Returned');
    
    if (isAssigned) {
      throw new Error("This equipment is currently assigned to an active event or handover and cannot be deleted.");
    }

    const prevEquipment = [...equipment];
    setEquipment((prev) => prev.filter((e) => e.equipment_id !== equipmentId));
    
    const res = await pushDelete('equipment', 'equipment_id', equipmentId);
    if (res.success) {
      logActivity(`De-registered Studio Gear: ${equipmentId}`, 'EquipmentManagement', equipmentId);
    } else {
      setEquipment(prevEquipment);
      throw new Error(res.error || 'Failed to delete equipment');
    }
    return res;
  };

  const addCalendarMemo = async (memo: Omit<CalendarMemo, 'id' | 'created_at' | 'updated_at'>) => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.from('calendar_memos').insert([memo]).select().single();
    if (error) {
      console.error('Failed to add memo:', error);
      throw error;
    }
    if (data) {
      setCalendarMemos((prev) => [data, ...prev]);
    }
  };

  const updateCalendarMemo = async (id: string, updates: Partial<CalendarMemo>) => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.from('calendar_memos').update(updates).eq('id', id).select().single();
    if (error) {
      console.error('Failed to update memo:', error);
      throw error;
    }
    if (data) {
      setCalendarMemos((prev) => prev.map((m) => m.id === id ? data : m));
    }
  };

  const deleteCalendarMemo = async (id: string) => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.from('calendar_memos').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete memo:', error);
      throw error;
    }
    setCalendarMemos((prev) => prev.filter((m) => m.id !== id));
  };

  const addPackage = async (pkg: Omit<Package, 'package_id'>) => {
    const package_id = `PKG-${(pkg.category || 'W').substring(0, 1).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
    const newPkg: Package = {
      ...pkg,
      package_id,
      created_at: new Date().toISOString()
    };

    const extraData = {
      category: newPkg.category,
      deliverables: newPkg.deliverables,
      team_members: newPkg.team_members || '',
      seasonal_offer: newPkg.seasonal_offer || '',
      terms_conditions: newPkg.terms_conditions || '',
      event_type: newPkg.event_type || newPkg.category || '',
      duration: newPkg.duration || '',
      package_includes: newPkg.package_includes || ''
    };

    const dbPayload = {
      package_id: newPkg.package_id,
      name: newPkg.package_name,
      description: JSON.stringify(extraData),
      price: newPkg.price,
      status: newPkg.status,
      created_at: newPkg.created_at,
      category: newPkg.category
    };

    // 1. Perform Database Schema Validation before the operation
    try {
      await validatePackagesDatabase('INSERT', dbPayload);
    } catch (e) {
      console.error(e);
      throw e;
    }

    try {
      if (supabaseClient) {
        const { error } = await supabaseClient.from('packages').insert(dbPayload);
        if (error) throw error;

        // 2. Post-Save Verification
        const { data: verifyData, error: verifyError } = await supabaseClient.from('packages').select('*').eq('package_id', package_id);
        if (verifyError || !verifyData || verifyData.length === 0) {
          throw new Error(verifyError?.message || 'Record not found after creation');
        }

        const savedRec = verifyData[0];
        if (!savedRec.package_id || !savedRec.name || savedRec.price === null || !savedRec.status || savedRec.description === null) {
          throw new Error('Verification failed: Post-save verification detected NULL required fields.');
        }

        const savedPkg = mapDbRecordToPackage(savedRec);
        
        // Update local React state only after successful post-save verification!
        setPackages((prev) => [savedPkg, ...prev]);

        if (savedPkg.category) saveCustomCategoryToStorage(savedPkg.category);
        if (savedPkg.event_type) saveCustomCategoryToStorage(savedPkg.event_type);

        window.alert('Package Created Successfully');
        logActivity(`Created Package: ${savedPkg.package_name}`, 'Sales', package_id, 'Active', 'Active');
        return package_id;
      } else {
        throw new Error('Supabase client is not initialized.');
      }
    } catch (err: any) {
      console.error(err);
      window.alert(`❌ Database Error\n\nTable: packages\n\nReason: ${err.message || err}`);
      throw err;
    }
  };

  const updatePackage = async (packageId: string, updates: Partial<Package>) => {
    const existing = packages.find(p => p.package_id === packageId);
    if (!existing) {
      const errorMsg = `Package with ID ${packageId} not found in state.`;
      window.alert(errorMsg);
      throw new Error(errorMsg);
    }

    const merged = { ...existing, ...updates };

    const extraData = {
      category: merged.category,
      deliverables: merged.deliverables,
      team_members: merged.team_members || '',
      seasonal_offer: merged.seasonal_offer || '',
      terms_conditions: merged.terms_conditions || '',
      event_type: merged.event_type || merged.category || '',
      duration: merged.duration || '',
      package_includes: merged.package_includes || ''
    };

    const dbPayload = {
      package_id: packageId,
      name: merged.package_name,
      description: JSON.stringify(extraData),
      price: merged.price,
      status: merged.status,
      created_at: merged.created_at || new Date().toISOString(),
      category: merged.category
    };

    // 1. Perform Database Schema Validation before the operation
    try {
      await validatePackagesDatabase('UPDATE', dbPayload);
    } catch (e) {
      console.error(e);
      throw e;
    }

    try {
      if (supabaseClient) {
        const { error } = await supabaseClient.from('packages').update({
          name: dbPayload.name,
          description: dbPayload.description,
          price: dbPayload.price,
          status: dbPayload.status,
          category: dbPayload.category
        }).eq('package_id', packageId);
        
        if (error) throw error;

        // 2. Post-Save Verification
        const { data: verifyData, error: verifyError } = await supabaseClient.from('packages').select('*').eq('package_id', packageId);
        if (verifyError || !verifyData || verifyData.length === 0) {
          throw new Error(verifyError?.message || 'Record not found after update');
        }

        const savedRec = verifyData[0];
        if (!savedRec.package_id || !savedRec.name || savedRec.price === null || !savedRec.status || savedRec.description === null) {
          throw new Error('Verification failed: Post-save verification detected NULL required fields.');
        }

        const updatedPkg = mapDbRecordToPackage(savedRec);

        // Update local React state only after successful post-save verification!
        setPackages((prev) => prev.map((p) => p.package_id === packageId ? updatedPkg : p));

        if (updatedPkg.category) saveCustomCategoryToStorage(updatedPkg.category);
        if (updatedPkg.event_type) saveCustomCategoryToStorage(updatedPkg.event_type);

        window.alert('Package Updated Successfully');
        logActivity(`Updated Package: ${updatedPkg.package_name}`, 'Sales', packageId, 'Active', 'Active');
      } else {
        throw new Error('Supabase client is not initialized.');
      }
    } catch (err: any) {
      console.error(err);
      window.alert(`❌ Database Error\n\nTable: packages\n\nReason: ${err.message || err}`);
      throw err;
    }
  };

  const deletePackage = async (packageId: string) => {
    if (!packageId || typeof packageId !== 'string' || !packageId.trim()) {
      const err = new Error('Invalid package identifier. Cannot delete without a valid package ID.');
      console.error(err);
      throw err;
    }

    try {
      const targetId = packageId.trim();
      const pkg = packages.find(p => p.package_id === targetId);
      const pkgName = pkg ? pkg.package_name : targetId;

      // 1. Perform database delete through pushDelete (uses server-side proxy with service role key & direct Supabase delete)
      const result = await pushDelete('packages', 'package_id', targetId);
      
      // If pushDelete reported failure, retry directly on Supabase targeting 'id' or 'package_id'
      if (!result.success && supabaseClient) {
        try {
          const { error: idError } = await supabaseClient.from('packages').delete().eq('id', targetId);
          if (!idError) {
            result.success = true;
          }
        } catch (_) {}
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete package from database. Please check your connection and permissions.');
      }

      // 2. Remove from local storage fallback store & record in deleted package IDs
      try {
        const localKey = 'erp_local_packages';
        const existingLocalStr = localStorage.getItem(localKey);
        if (existingLocalStr) {
          const localRecords = JSON.parse(existingLocalStr);
          const filtered = localRecords.filter((r: any) => r && r.package_id !== targetId && r.id !== targetId);
          localStorage.setItem(localKey, JSON.stringify(filtered));
        }

        const deletedKey = 'erp_deleted_package_ids';
        const existingDeletedStr = localStorage.getItem(deletedKey);
        let deletedList: string[] = [];
        if (existingDeletedStr) {
          try {
            const parsed = JSON.parse(existingDeletedStr);
            if (Array.isArray(parsed)) deletedList = parsed;
          } catch (_) {}
        }
        if (!deletedList.includes(targetId)) {
          deletedList.push(targetId);
          localStorage.setItem(deletedKey, JSON.stringify(deletedList));
        }
      } catch (_) {}

      // 3. Update local React state only after confirmed database deletion
      setPackages((prev) => prev.filter((p) => String(p.package_id) !== targetId));
      logActivity(`Deleted Package: ${pkgName}`, 'Sales', targetId, 'Active', 'Deleted');
    } catch (err: any) {
      console.error('[deletePackage Error]', err);
      throw err;
    }
  };

  const addNotification = async (payload: Omit<Notification, 'notification_id' | 'created_at' | 'read_status'> & { notification_id?: string; read_status?: boolean }) => {
    const notification_id = payload.notification_id || `NTF-${6001 + Math.floor(Math.random() * 10000)}`;
    const newNotif: Notification = {
      ...payload,
      notification_id,
      created_at: new Date().toISOString(),
      read_status: payload.read_status ?? false
    };
    
    // Optimistic UI update
    setNotifications((prev) => {
      const exists = prev.some(n => n.notification_id === notification_id);
      if (exists) return prev;
      return [newNotif, ...prev];
    });
    
    // Save to database
    await saveNotificationToSupabase(newNotif);
    // fetchFromDb().catch(console.error); // Disabled to prevent full reload
  };

  const markNotificationRead = async (notificationId: string) => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => n.notification_id === notificationId ? { ...n, read_status: true, is_read: true, read: true, read_at: now } : n));
    if (!supabaseClient) return;
    
    const { error } = await supabaseClient.from('notifications').update({ read_status: true, is_read: true, read_at: now }).eq('notification_id', notificationId);
    if (error) {
      console.warn("Failed updating notification with all fields, trying fallback:", error);
      await supabaseClient.from('notifications').update({ is_read: true, read_at: now }).eq('notification_id', notificationId);
    }
  };

  const markAllNotificationsRead = async () => {
    const visibleNotifs = notifications.filter(n => {
      if (currentRole !== 'Business Owner') {
        return n.recipient_role === currentRole || n.recipient_role === 'All';
      }
      return true;
    });

    const unreadIds = visibleNotifs.filter(n => !n.read_status).map(n => n.notification_id);
    if (unreadIds.length === 0) return;

    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => unreadIds.includes(n.notification_id) ? { ...n, read_status: true, is_read: true, read: true, read_at: now } : n));

    if (!supabaseClient) return;

    const { error } = await supabaseClient
      .from('notifications')
      .update({ read_status: true, is_read: true, read_at: now })
      .in('notification_id', unreadIds);
    if (error) {
      console.warn("Failed batch update of notifications, trying fallback:", error);
      await supabaseClient
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .in('notification_id', unreadIds);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.notification_id !== notificationId));

    try {
      const deletedStr = localStorage.getItem('erp_deleted_notifications');
      const deletedIds = deletedStr ? JSON.parse(deletedStr) : [];
      if (!deletedIds.includes(notificationId)) {
        deletedIds.push(notificationId);
        localStorage.setItem('erp_deleted_notifications', JSON.stringify(deletedIds));
      }
    } catch (e) {
      console.warn("Failed to write deleted notification to localStorage:", e);
    }

    if (!supabaseClient) return;

    const { error } = await supabaseClient
      .from('notifications')
      .delete()
      .eq('notification_id', notificationId);
    if (error) {
      console.warn("Failed to delete notification in Supabase:", error);
    }
  };

  const deleteAllReadNotifications = async () => {
    const visibleNotifs = notifications.filter(n => {
      if (currentRole !== 'Business Owner') {
        return n.recipient_role === currentRole || n.recipient_role === 'All';
      }
      return true;
    });

    const readIds = visibleNotifs.filter(n => n.read_status).map(n => n.notification_id);
    if (readIds.length === 0) return;

    setNotifications((prev) => prev.filter((n) => !readIds.includes(n.notification_id)));

    try {
      const deletedStr = localStorage.getItem('erp_deleted_notifications');
      const deletedIds = deletedStr ? JSON.parse(deletedStr) : [];
      readIds.forEach(id => {
        if (!deletedIds.includes(id)) {
          deletedIds.push(id);
        }
      });
      localStorage.setItem('erp_deleted_notifications', JSON.stringify(deletedIds));
    } catch (e) {
      console.warn("Failed to write deleted notifications to localStorage:", e);
    }

    if (!supabaseClient) return;

    const { error } = await supabaseClient
      .from('notifications')
      .delete()
      .in('notification_id', readIds);
    if (error) {
      console.warn("Failed to bulk delete notifications in Supabase:", error);
    }
  };

  const archiveNotification = async (notificationId: string, archiveStatus = true) => {
    setNotifications((prev) => prev.map((n) => n.notification_id === notificationId ? { ...n, is_archived: archiveStatus } : n));

    if (!supabaseClient) return;

    const { error } = await supabaseClient
      .from('notifications')
      .update({ is_archived: archiveStatus })
      .eq('notification_id', notificationId);
    if (error) {
      console.warn("Failed to archive notification in Supabase:", error);
    }
  };

  const addSpeciality = async (name: string) => {
    const id = `SPC-${Math.floor(100 + Math.random() * 900)}`;
    const newSpec: ProductionSpeciality = {
      speciality_id: id,
      name,
      active: true,
      created_at: new Date().toISOString()
    };
    setSpecialities(prev => [newSpec, ...prev]);
    await pushInsert('production_specialties', newSpec);
    logActivity(`Created Role Speciality: ${name}`, 'Production', id);
  };

  const updateSpeciality = async (id: string, name: string) => {
    setSpecialities(prev => prev.map(s => s.speciality_id === id ? { ...s, name } : s));
    await pushUpdate('production_specialties', 'speciality_id', id, { name });
    logActivity(`Updated Speciality to: ${name}`, 'Production', id);
  };

  const deactivateSpeciality = async (id: string, active: boolean) => {
    setSpecialities(prev => prev.map(s => s.speciality_id === id ? { ...s, active } : s));
    await pushUpdate('production_specialties', 'speciality_id', id, { active });
    logActivity(`${active ? 'Activated' : 'Deactivated'} Speciality: ${id}`, 'Production', id);
  };

  const deleteSpeciality = async (id: string) => {
    setSpecialities(prev => prev.filter(s => s.speciality_id !== id));
    await pushDelete('production_specialties', 'speciality_id', id);
    logActivity(`Deleted Speciality: ${id}`, 'Production', id);
  };

  const assignEditorToProject = async (assignment: Omit<EditorAssignment, 'assignment_id' | 'status' | 'assigned_date'>) => {
    const id = `EDR-${crypto.randomUUID()}`;
    const newAssign: EditorAssignment = {
      ...assignment,
      assignment_id: id,
      status: 'Assigned',
      assigned_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    };
    setEditorAssignments(prev => [newAssign, ...prev]);
    logActivity(`Assigned Editor: ${assignment.staff_name} as ${assignment.speciality}`, 'Production', id);
    
    const prodProj = augmentedProduction.find(p => p.production_id === assignment.production_id);
    let prodPromise: Promise<any> = Promise.resolve();
    if (prodProj) {
      const currentAssigned = prodProj.assigned_staff ? prodProj.assigned_staff.split(', ') : [];
      if (!currentAssigned.includes(assignment.staff_name)) {
        currentAssigned.push(assignment.staff_name);
        const updatedStaff = currentAssigned.join(', ');
        prodPromise = updateProduction(assignment.production_id, {
          assigned_staff: updatedStaff,
          editor_assigned: assignment.staff_name, // keep the latest assigned as the main editor_assigned
          production_status: 'Editor Assigned'
        });
      }
    }

    await Promise.all([
      pushInsert('editor_assignments', newAssign),
      prodPromise
    ]);
  };

  const updateEditorAssignment = async (assignmentId: string, updates: Partial<Omit<EditorAssignment, 'assignment_id'>>) => {
    let targetAssignment: EditorAssignment | undefined;
    
    setEditorAssignments(prev => {
      const updated = prev.map(a => {
        if (a.assignment_id === assignmentId) {
          targetAssignment = { ...a, ...updates };
          return targetAssignment;
        }
        return a;
      });
      localStorage.setItem('erp_editor_assignments', JSON.stringify(updated));
      return updated;
    });

    await pushUpdate('editor_assignments', 'assignment_id', assignmentId, updates);
    logActivity(`Updated Editor Task ${assignmentId} fields: ${Object.keys(updates).join(', ')}`, 'Production', assignmentId);
  };

  const updateEditorAssignmentStatus = async (
    assignmentId: string,
    status: EditorAssignment['status'],
    extraUpdates?: Partial<Omit<EditorAssignment, 'assignment_id'>>
  ) => {
    let targetAssignment: EditorAssignment | undefined;
    let updatedList: EditorAssignment[] = [];
    
    setEditorAssignments(prev => {
      const updated = prev.map(a => {
        if (a.assignment_id === assignmentId) {
          targetAssignment = { ...a, status, ...(extraUpdates || {}) };
          return targetAssignment;
        }
        return a;
      });
      updatedList = updated;
      try {
        localStorage.setItem('erp_editor_assignments', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });

    const pushRes = await pushUpdate('editor_assignments', 'assignment_id', assignmentId, { status, ...(extraUpdates || {}) });
    
    // Re-fetch exact record to guarantee database verified state
    try {
      if (supabaseClient) {
        const { data } = await supabaseClient.from('editor_assignments').select('*').eq('assignment_id', assignmentId).single();
        if (data) {
          setEditorAssignments(prev => prev.map(a => a.assignment_id === assignmentId ? { ...a, ...data } : a));
        }
      }
    } catch (_) {}

    logActivity(`Updated Editor Task ${assignmentId} status to: ${status}`, 'Production', assignmentId);
    
    // Immediately calculate and synchronize production status without detached timeout race conditions
    const assignment = updatedList.find(a => a.assignment_id === assignmentId) || targetAssignment;
    if (assignment) {
      const prodId = assignment.production_id;
      const orderId = assignment.order_id;
      const allTasks = updatedList.filter(t => 
        (prodId && t.production_id === prodId) ||
        (orderId && (t.order_id === orderId || t.production_id === orderId))
      );
      
      const completedTasks = allTasks.filter(t => t.status === 'Completed' || t.status === 'Editing Complete' || t.status === 'Editing Completed').length;
      const totalTasks = allTasks.length;
      const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      const prodObj = (production || []).find(p => 
        (prodId && p.production_id === prodId) ||
        (orderId && (p.order_id === orderId || p.tracking_id === orderId)) ||
        (prodId && (p.order_id === prodId || p.tracking_id === prodId))
      );
      let baseStatus = prodObj?.editing_status || (prodObj as any)?.production_status || (prodObj as any)?.current_status || 'Raw Footage Received';

      let nextEditingStatus: EditingStatus | undefined = undefined;
      
      const terminalStatuses = ['Completed', 'Closed', 'Client Acceptance', 'Project Closed', 'Order Closed', 'Final Approval'];
      const tgtOrder = augmentedOrders.find(o => 
        (orderId && o.order_id === orderId) || 
        (prodId && o.order_id === prodId) || 
        (prodObj && (o.order_id === (prodObj as any)?.order_id || o.order_id === prodObj?.tracking_id || o.lead_id === prodObj?.tracking_id))
      );
      const tgtLead = leads.find(l => 
        (orderId && l.lead_id === orderId) || 
        (prodId && l.lead_id === prodId) || 
        (prodObj && (l.lead_id === (prodObj as any)?.lead_id || l.lead_id === prodObj?.tracking_id))
      );
      if (tgtOrder && terminalStatuses.includes(tgtOrder.current_stage)) baseStatus = 'Order Closed';
      if (tgtLead && terminalStatuses.includes(tgtLead.status)) baseStatus = 'Order Closed';
      const isTerminal = (prodObj as any)?.current_status === 'Client Acceptance' ||
                         (prodObj as any)?.production_status === 'Client Acceptance' ||
                         prodObj?.editing_status === 'Client Acceptance' ||
                         terminalStatuses.includes(baseStatus) || 
                         terminalStatuses.includes(prodObj?.editing_status || '') ||
                         terminalStatuses.includes((prodObj as any)?.production_status || '') ||
                         terminalStatuses.includes((prodObj as any)?.current_status || '');

      // Do not override terminal or Client Acceptance statuses
      if (!isTerminal) {
        if (totalTasks > 0) {
          const getTaskStageRank = (st: string, driveLink?: string) => {
            const s = st || '';
            if (['Client Acceptance'].includes(s)) return 5;
            if (['Completed', 'Editing Completed', 'Editing Complete'].includes(s)) return 4;
            if (['Customer Review', 'Client Review', 'Client Review Sent'].includes(s) || (driveLink && driveLink.trim() !== '')) return 3;
            if (['Editing Started', 'Editing Start', 'In Progress', 'Editing In Progress'].includes(s)) return 2;
            if (['Assigned Editor', 'Editor Assigned', 'Assigned'].includes(s)) return 1;
            return 0;
          };

          const ranks = allTasks.map(t => getTaskStageRank(t.status, t.edited_drive_link));
          const minRank = Math.min(...ranks);

          if (minRank >= 5) {
            nextEditingStatus = 'Client Acceptance' as any;
          } else if (minRank >= 4) {
            nextEditingStatus = 'Editing Completed' as any;
          } else if (minRank >= 3) {
            nextEditingStatus = 'Customer Review' as any;
          } else if (minRank >= 2) {
            nextEditingStatus = 'Editing Started' as any;
          } else if (minRank >= 1) {
            nextEditingStatus = 'Assigned Editor' as any;
          }
        }
      }
      
      const updates: Partial<Omit<Production, 'production_id' | 'tracking_id'>> = {
        editing_progress: `${progressPercent}%`,
        remarks: `Task updated: ${assignment.staff_name} (${assignment.speciality}) marked status to ${status}. Total Project Tasks Progress: ${progressPercent}%.`
      };
      
      if (nextEditingStatus) {
        updates.editing_status = nextEditingStatus;
      }
      
      const targetProdIdToUpdate = prodObj?.production_id || prodId || orderId;
      if (targetProdIdToUpdate) {
        await updateProduction(targetProdIdToUpdate, updates);
      }
    }
    return pushRes;
  };

  const deleteEditorAssignment = async (assignmentId: string) => {
    setEditorAssignments(prev => prev.filter(a => a.assignment_id !== assignmentId));
    await pushDelete('editor_assignments', 'assignment_id', assignmentId);
    logActivity(`Removed Editor Task Assignment: ${assignmentId}`, 'Production', assignmentId);
  };

  const saveClientAcceptanceVerification = async (verification: ClientAcceptanceVerification): Promise<ClientAcceptanceVerification> => {
    const cleanOrderId = String(verification.order_id || '').trim();
    const cleanEventId = String(verification.event_id || 'default').trim();
    const preparedVerification: ClientAcceptanceVerification = {
      ...verification,
      order_id: cleanOrderId,
      event_id: cleanEventId,
      consent_proof_verified: verification.consent_proof_verified !== undefined ? Boolean(verification.consent_proof_verified) : true,
      updated_at: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/client-acceptance/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preparedVerification)
      });
      const parsed = await safeParseResponse(res);
      const saved: ClientAcceptanceVerification = (parsed.ok && parsed.isJson && parsed.data?.success && parsed.data?.data)
        ? parsed.data.data
        : preparedVerification;

      setClientAcceptanceVerifications(prev => {
        const oId = String(saved.order_id || '').trim().toLowerCase();
        const eId = String(saved.event_id || 'default').trim().toLowerCase();
        const sTaskId = String(saved.task_id || saved.assignment_id || '').trim().toLowerCase();
        const existingIdx = prev.findIndex(
          r => {
            const rTaskId = String(r.task_id || r.assignment_id || '').trim().toLowerCase();
            if (sTaskId && rTaskId) {
              return rTaskId === sTaskId && String(r.order_id || '').trim().toLowerCase() === oId;
            }
            return String(r.order_id || '').trim().toLowerCase() === oId &&
                 String(r.event_id || 'default').trim().toLowerCase() === eId;
          }
        );
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], ...saved };
          return next;
        }
        return [...prev, saved];
      });

      return saved;
    } catch (err) {
      console.warn('[RoleContext] Network save for CA verification failed, updating local state:', err);
      setClientAcceptanceVerifications(prev => {
        const oId = String(preparedVerification.order_id || '').trim().toLowerCase();
        const eId = String(preparedVerification.event_id || 'default').trim().toLowerCase();
        const sTaskId = String(preparedVerification.task_id || preparedVerification.assignment_id || '').trim().toLowerCase();
        const existingIdx = prev.findIndex(
          r => {
            const rTaskId = String(r.task_id || r.assignment_id || '').trim().toLowerCase();
            if (sTaskId && rTaskId) {
              return rTaskId === sTaskId && String(r.order_id || '').trim().toLowerCase() === oId;
            }
            return String(r.order_id || '').trim().toLowerCase() === oId &&
                 String(r.event_id || 'default').trim().toLowerCase() === eId;
          }
        );
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], ...preparedVerification };
          return next;
        }
        return [...prev, preparedVerification];
      });
      return preparedVerification;
    }
  };

  const addQuotation = async (newQuote: any): Promise<string> => {
    if (!supabaseClient) {
      setQuotations((prev) => {
        const next = [newQuote, ...prev];
        localStorage.setItem('erp_quotations', JSON.stringify(next));
        return next;
      });
      return newQuote.quotation_number;
    }

    // Verify logged-in user is authenticated
    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.warn("User is not authenticated. Cannot insert quotation.");
      throw new Error("You must be logged in to generate a quotation.");
    }

    // 1. Try to invoke the database-side atomic upsert function
    try {
      const rpcPayload = {
        p_quotation_id: newQuote.quotation_id,
        p_lead_id: newQuote.lead_id,
        p_package_name: newQuote.package_name,
        p_package_price: Number(newQuote.package_price || 0),
        p_quotation_amount: Number(newQuote.quotation_amount || 0),
        p_discount_amount: Number(newQuote.discount_amount || 0),
        p_additional_services_cost: Number(newQuote.additional_services_cost || 0),
        p_final_amount: Number(newQuote.final_amount || 0),
        p_tax_amount: Number(newQuote.tax_amount || 0),
        p_quotation_status: newQuote.quotation_status,
        p_generated_date: newQuote.generated_date || new Date().toISOString().split('T')[0],
        p_created_by: newQuote.created_by || userData.user.email || 'Sales Team',
        p_terms_conditions: newQuote.terms_conditions || '',
        p_deliverables_description: newQuote.deliverables_description || '',
        p_notes_special_customizations: newQuote.notes_special_customizations || '',
        p_client_residence_address: newQuote.client_residence_address || '',
        p_city: newQuote.city || '',
        p_state: newQuote.state || '',
        p_pincode: newQuote.pincode || '',
        p_desired_event_shoot_type: newQuote.desired_event_shoot_type || '',
        p_customer_id: newQuote.customer_id || '',
        p_customer_name: newQuote.customer_name || '',
        p_order_id: newQuote.order_id || '',
        p_pdf_url: newQuote.pdf_url || '',
        p_whatsapp_sent_status: !!newQuote.whatsapp_sent_status,
        p_viewed_status: !!newQuote.viewed_status,
        p_sales_staff_name: newQuote.sales_staff_name || '',
        p_sales_staff_mobile: newQuote.sales_staff_mobile || '',
        p_editable_inclusions: newQuote.editableInclusions || null,
        p_editable_deliverables: newQuote.editableDeliverables || null
      };

      console.log("Invoking atomic database transaction: upsert_quotation RPC...", rpcPayload);
      const { data, error } = await supabaseClient.rpc('upsert_quotation', rpcPayload);

      if (!error && data && data.length > 0) {
        const result = data[0];
        const finalQuoteId = result.r_quotation_id || newQuote.quotation_id;
        const finalQuoteNum = result.r_quotation_number || newQuote.quotation_number;
        const action = result.r_action || 'INSERT';

        console.log(`✔ Database transaction succeeded via RPC [Action: ${action}]! Final Quote Number: ${finalQuoteNum}`);

        const finalQuoteObj = {
          ...newQuote,
          quotation_id: finalQuoteId,
          quotation_number: finalQuoteNum,
          updated_at: new Date().toISOString()
        };

        setQuotations((prev) => {
          let next;
          if (action === 'UPDATE') {
            next = prev.map((q) => q.quotation_id === finalQuoteId || q.lead_id === newQuote.lead_id ? finalQuoteObj : q);
          } else {
            next = [finalQuoteObj, ...prev.filter(q => q.lead_id !== newQuote.lead_id)];
          }
          localStorage.setItem('erp_quotations', JSON.stringify(next));
          return next;
        });

        logActivity(
          `${action === 'UPDATE' ? 'Updated' : 'Generated'} Quotation: ${finalQuoteNum}`, 
          'Sales', 
          newQuote.lead_id, 
          'N/A', 
          `Quotation ${action === 'UPDATE' ? 'Updated' : 'Generated'}`
        );

        return finalQuoteNum;
      } else if (error) {
        // If it's a 404 (method not found), we fall back gracefully to the safe client-side check. Otherwise log warning.
        if (error.code !== 'P0001' && !error.message.includes('function') && !error.message.includes('404')) {
          console.warn("RPC call failed with database-level error:", error);
          throw new Error(`Database transaction failed: ${error.message}`);
        }
        console.info("RPC upsert_quotation not found or not yet applied. Falling back to progressive enhancement client check...");
      }
    } catch (rpcErr: any) {
      if (rpcErr.message && rpcErr.message.includes('Database transaction failed')) {
        throw rpcErr;
      }
      console.warn("Exception during RPC check, falling back to safe local check:", rpcErr);
    }

    // 2. Safe Progressive Fallback: Retrieve existing quotation directly from DB
    console.log("Running safe fallback: checking for existing quotation for Lead ID:", newQuote.lead_id);
    const { data: dbExisting, error: checkErr } = await supabaseClient
      .from('quotations')
      .select('quotation_id, quotation_number')
      .eq('lead_id', newQuote.lead_id)
      .maybeSingle();

    if (checkErr) {
      console.warn("Error running safe db check:", checkErr.message);
    }

    const standardPayload = {
      lead_id: newQuote.lead_id,
      quotation_amount: newQuote.quotation_amount,
      discount_amount: newQuote.discount_amount,
      tax_amount: newQuote.tax_amount || 0,
      final_amount: newQuote.final_amount,
      quotation_status: newQuote.quotation_status,
      valid_until: newQuote.valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      terms_conditions: newQuote.terms_conditions || '',
      updated_at: new Date().toISOString(),
      package_name: newQuote.package_name,
      package_price: newQuote.package_price,
      deliverables_description: newQuote.deliverables_description,
      notes_special_customizations: newQuote.notes_special_customizations,
      additional_services_cost: newQuote.additional_services_cost,
      client_residence_address: newQuote.client_residence_address,
      city: newQuote.city,
      state: newQuote.state,
      pincode: newQuote.pincode,
      desired_event_shoot_type: newQuote.desired_event_shoot_type,
      customer_id: newQuote.customer_id,
      customer_name: newQuote.customer_name,
      order_id: newQuote.order_id,
      pdf_url: newQuote.pdf_url,
      whatsapp_sent_status: !!newQuote.whatsapp_sent_status,
      viewed_status: !!newQuote.viewed_status,
      generated_date: newQuote.generated_date,
      sales_staff_name: newQuote.sales_staff_name || '',
      sales_staff_mobile: newQuote.sales_staff_mobile || '',
      editableInclusions: newQuote.editableInclusions || null,
      editableDeliverables: newQuote.editableDeliverables || null
    };

    if (dbExisting) {
      console.log(`Fallback Match: Found existing quotation ${dbExisting.quotation_number}. Performing UPDATE.`);
      
      const { error: updateErr } = await supabaseClient
        .from('quotations')
        .update(standardPayload)
        .eq('quotation_id', dbExisting.quotation_id);

      if (updateErr) {
        throw new Error(`Failed to update existing quotation in database: ${updateErr.message}`);
      }

      const finalQuoteObj = {
        ...newQuote,
        quotation_id: dbExisting.quotation_id,
        quotation_number: dbExisting.quotation_number,
        updated_at: new Date().toISOString()
      };

      setQuotations((prev) => {
        const next = prev.map((q) => q.quotation_id === dbExisting.quotation_id || q.lead_id === newQuote.lead_id ? finalQuoteObj : q);
        localStorage.setItem('erp_quotations', JSON.stringify(next));
        return next;
      });

      logActivity(`Updated Quotation: ${dbExisting.quotation_number}`, 'Sales', newQuote.lead_id, 'N/A', 'Quotation Updated');
      return dbExisting.quotation_number;
    } else {
      console.log(`Fallback Match: No existing quotation found. Performing INSERT.`);
      
      const insertPayload = {
        ...standardPayload,
        quotation_id: newQuote.quotation_id,
        quotation_number: newQuote.quotation_number, // Trigger will override if sequence is applied
        created_by: newQuote.created_by || userData.user.email || 'Sales Team',
        created_at: newQuote.created_at || new Date().toISOString()
      };

      const { error: insertErr } = await supabaseClient
        .from('quotations')
        .insert(insertPayload);

      if (insertErr) {
        // Double check if there was a duplicate race condition error on quotation_number
        if (insertErr.message.includes('unique constraint') || insertErr.code === '23505') {
          console.warn("Detected constraint race condition on insert. Fetching newly created quotation row...");
          const { data: dbFresh } = await supabaseClient
            .from('quotations')
            .select('quotation_id, quotation_number')
            .eq('lead_id', newQuote.lead_id)
            .maybeSingle();

          if (dbFresh) {
            const finalQuoteObj = {
              ...newQuote,
              quotation_id: dbFresh.quotation_id,
              quotation_number: dbFresh.quotation_number,
              updated_at: new Date().toISOString()
            };
            setQuotations((prev) => {
              const next = [finalQuoteObj, ...prev.filter(q => q.lead_id !== newQuote.lead_id)];
              localStorage.setItem('erp_quotations', JSON.stringify(next));
              return next;
            });
            return dbFresh.quotation_number;
          }
        }
        throw new Error(`Failed to save new quotation to database: ${insertErr.message}`);
      }

      setQuotations((prev) => {
        const next = [newQuote, ...prev.filter(q => q.lead_id !== newQuote.lead_id)];
        localStorage.setItem('erp_quotations', JSON.stringify(next));
        return next;
      });

      logActivity(`Generated Quotation: ${newQuote.quotation_number}`, 'Sales', newQuote.lead_id, 'N/A', 'Quotation Generated');
      return newQuote.quotation_number;
    }
  };

  const updateQuotation = async (quotationId: string, updates: Partial<any>) => {
    let updatedQuote: any = null;
    
    setQuotations((prev) => {
      const next = prev.map((q) => {
        if (q.quotation_id === quotationId) {
          updatedQuote = { ...q, ...updates, updated_at: new Date().toISOString() };
          return updatedQuote;
        }
        return q;
      });
      localStorage.setItem('erp_quotations', JSON.stringify(next));
      return next;
    });

    setTimeout(async () => {
      if (!updatedQuote) return;
      if (!supabaseClient) return;

      let cleanTerms = updatedQuote.terms_conditions || '';
      if (cleanTerms.includes('\n\nMETADATA:')) {
        cleanTerms = cleanTerms.split('\n\nMETADATA:')[0];
      } else if (cleanTerms.includes('METADATA:')) {
        cleanTerms = cleanTerms.split('METADATA:')[0];
      }
      
      const standardPayload = {
        quotation_status: updatedQuote.quotation_status,
        terms_conditions: cleanTerms,
        package_name: updatedQuote.package_name,
        package_price: updatedQuote.package_price,
        deliverables_description: updatedQuote.deliverables_description,
        notes_special_customizations: updatedQuote.notes_special_customizations,
        discount_amount: updatedQuote.discount_amount,
        additional_services_cost: updatedQuote.additional_services_cost,
        quotation_amount: updatedQuote.quotation_amount,
        tax_amount: updatedQuote.tax_amount || 0,
        final_amount: updatedQuote.final_amount,
        client_residence_address: updatedQuote.client_residence_address,
        city: updatedQuote.city,
        state: updatedQuote.state,
        pincode: updatedQuote.pincode,
        desired_event_shoot_type: updatedQuote.desired_event_shoot_type,
        updated_at: new Date().toISOString(),
        customer_id: updatedQuote.customer_id,
        customer_name: updatedQuote.customer_name,
        order_id: updatedQuote.order_id,
        pdf_url: updatedQuote.pdf_url,
        whatsapp_sent_status: updatedQuote.whatsapp_sent_status,
        viewed_status: updatedQuote.viewed_status,
        generated_date: updatedQuote.generated_date,
        sales_staff_name: updatedQuote.sales_staff_name || '',
        sales_staff_mobile: updatedQuote.sales_staff_mobile || '',
        editableInclusions: updatedQuote.editableInclusions || null,
        editableDeliverables: updatedQuote.editableDeliverables || null
      };

      try {
        const { error } = await supabaseClient.from('quotations').update(standardPayload).eq('quotation_id', quotationId);
        if (error) {
          console.warn('Supabase Update error for quotations table:', error.message);
        }
      } catch (err) {
        console.warn('Supabase Exception on updating quotation:', err);
      }
    }, 10);
  };

  const addEquipmentHandover = async (handover: Omit<EquipmentHandover, 'handover_id'>) => {
    const handoverId = `HND-${Math.floor(1000 + Math.random() * 9000)}`;
    const newHandover: EquipmentHandover = {
      ...handover,
      handover_id: handoverId,
      created_at: new Date().toISOString()
    };
    setEquipmentHandovers(prev => [newHandover, ...prev]);
    const leadEqHistItem: LeadEquipmentHistory = {
      id: `LEH-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      lead_id: handover.order_id || 'UNKNOWN',
      order_id: handover.order_id,
      equipment_name: handover.equipment_name,
      equipment_status: handover.return_status,
      returned_by: handover.returned_by || 'Staff',
      returned_at: handover.return_date ? new Date(handover.return_date).toISOString() : new Date().toISOString(),
      remarks: handover.notes || `Equipment Handover: ${handover.equipment_name} - ${handover.return_status}`
    };
    setLeadEquipmentHistory(prev => [leadEqHistItem, ...prev]);
    await pushInsert('equipment_handovers', newHandover);
    logActivity(`Registered Equipment Handover status for ${handover.equipment_name}: ${handover.return_status}`, 'Operations', handover.order_id);
  };

  const addEquipmentHandovers = async (handovers: Omit<EquipmentHandover, 'handover_id'>[]) => {
    const newHandovers: EquipmentHandover[] = handovers.map((h, index) => ({
      ...h,
      handover_id: `HND-${Math.floor(1000 + Math.random() * 9000)}-${index}`,
      created_at: new Date().toISOString()
    }));
    setEquipmentHandovers(prev => [...newHandovers, ...prev]);
    const newHistItems: LeadEquipmentHistory[] = handovers.map(h => ({
      id: `LEH-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      lead_id: h.order_id || 'UNKNOWN',
      order_id: h.order_id,
      equipment_name: h.equipment_name,
      equipment_status: h.return_status,
      returned_by: h.returned_by || 'Staff',
      returned_at: h.return_date ? new Date(h.return_date).toISOString() : new Date().toISOString(),
      remarks: h.notes || `Equipment Handover: ${h.equipment_name} - ${h.return_status}`
    }));
    setLeadEquipmentHistory(prev => [...newHistItems, ...prev]);
    for (const h of newHandovers) {
      await pushInsert('equipment_handovers', h);
      logActivity(`Registered Equipment Handover status for ${h.equipment_name}: ${h.return_status}`, 'Operations', h.order_id);
    }
  };

  const addLeadEquipmentHistory = async (history: Omit<LeadEquipmentHistory, 'id'>) => {
    const res = await pushInsert('lead_equipment_history', history);
    if (!res.success) {
      console.error('Error adding lead equipment history:', res.error);
      throw new Error(res.error || 'Failed to insert lead equipment history');
    }
    setLeadEquipmentHistory(prev => [{ ...history, id: `LEH-${Date.now()}-${Math.floor(Math.random()*1000)}` } as LeadEquipmentHistory, ...prev]);
  };

  const updateLead = async (leadId: string, updates: Partial<Lead>) => {
    if (!leadId || typeof leadId !== 'string' || leadId.trim() === '') {
      throw new Error('lead_id is missing or invalid.');
    }

    const prevLead = leads.find(l => l.lead_id === leadId);
    if (!prevLead) {
      console.warn(`Lead record with ID "${leadId}" was not found in local cache.`);
    }

    const timestamp = new Date().toISOString();
    const finalUpdates = { ...updates };

    const isExplicitStep3Save = (finalUpdates as any)._explicit_step3_save === true;
    delete (finalUpdates as any)._explicit_step3_save;

    // CRITICAL SAFETY GUARD: Prevent accidental overwrites of valuable fields with empty/default values
    // if the existing record already has valid data.
    if (prevLead && !isExplicitStep3Save) {
      if ('Add_Deliverable' in finalUpdates || 'deliverables_description' in finalUpdates) {
        const newVal = finalUpdates.Add_Deliverable ?? finalUpdates.deliverables_description;
        const prevVal = prevLead.Add_Deliverable ?? prevLead.deliverables_description;
        if ((!newVal || newVal === '[]' || newVal === '') && (prevVal && prevVal !== '[]' && prevVal !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of Add_Deliverable. Retaining existing data.`);
          delete finalUpdates.Add_Deliverable;
          delete finalUpdates.deliverables_description;
        } else if (newVal !== undefined) {
          finalUpdates.Add_Deliverable = newVal;
        }
      }

      if ('Team_Members' in finalUpdates || 'Team_member' in finalUpdates || 'team_members' in finalUpdates) {
        const newVal = (finalUpdates as any).Team_Members ?? (finalUpdates as any).Team_member ?? (finalUpdates as any).team_members;
        const prevVal = (prevLead as any).Team_Members || (prevLead as any).Team_member || (prevLead as any).team_members;
        if ((!newVal || newVal === '[]' || newVal === '') && (prevVal && prevVal !== '[]' && prevVal !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of Team_Members. Retaining existing data.`);
          delete (finalUpdates as any).Team_Members;
          delete (finalUpdates as any).Team_member;
          delete (finalUpdates as any).team_members;
        } else if (newVal !== undefined) {
          (finalUpdates as any).Team_Members = newVal;
        }
      }
      
      // Also check any possible alias used
      if ('Team_Members_Included' in finalUpdates) {
        const newVal = finalUpdates.Team_Members_Included;
        const prevVal = prevLead.Team_Members_Included;
        if ((!newVal || newVal === '[]' || newVal === '') && (prevVal && prevVal !== '[]' && prevVal !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of Team_Members_Included. Retaining existing data.`);
          delete finalUpdates.Team_Members_Included;
        }
      }
      
      if ('package_price' in finalUpdates) {
        const newVal = finalUpdates.package_price;
        const prevVal = prevLead.package_price;
        if ((newVal === null || newVal === undefined || newVal === 0 || (newVal as any) === '') && (prevVal !== null && prevVal !== undefined && prevVal !== 0 && (prevVal as any) !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of package_price. Retaining existing data.`);
          delete finalUpdates.package_price;
          // Also protect budget since they are often synced
          if ('budget' in finalUpdates && (finalUpdates.budget === null || finalUpdates.budget === undefined || finalUpdates.budget === 0 || (finalUpdates.budget as any) === '')) {
             delete finalUpdates.budget;
          }
        }
      }

      if ('Final_Package_Amount' in finalUpdates || 'final_package_amount' in finalUpdates || 'Final_Quotation_Amount' in finalUpdates) {
        const newVal = (finalUpdates as any).Final_Package_Amount ?? (finalUpdates as any).final_package_amount ?? (finalUpdates as any).Final_Quotation_Amount;
        const prevVal = (prevLead as any).Final_Package_Amount ?? (prevLead as any).final_package_amount ?? (prevLead as any).Final_Quotation_Amount;
        if ((newVal === null || newVal === undefined || newVal === 0 || (newVal as any) === '') && (prevVal !== null && prevVal !== undefined && prevVal !== 0 && (prevVal as any) !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of Final_Package_Amount. Retaining existing data.`);
          finalUpdates.Final_Package_Amount = Number(prevVal);
          (finalUpdates as any).final_package_amount = Number(prevVal);
          finalUpdates.Final_Quotation_Amount = Number(prevVal);
        } else if (newVal !== undefined && newVal !== null && !isNaN(Number(newVal)) && Number(newVal) > 0) {
          finalUpdates.Final_Package_Amount = Number(newVal);
          (finalUpdates as any).final_package_amount = Number(newVal);
          finalUpdates.Final_Quotation_Amount = Number(newVal);
        }
      }
      if ('Additional_Services_Cost' in finalUpdates) {
        const newVal = finalUpdates.Additional_Services_Cost;
        const prevVal = prevLead.Additional_Services_Cost;
        if ((newVal === null || newVal === undefined || (newVal as any) === '') && (prevVal !== null && prevVal !== undefined && (prevVal as any) !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of Additional_Services_Cost. Retaining existing data.`);
          finalUpdates.Additional_Services_Cost = prevVal;
        }
      }
      if ('Quotation_Discount' in finalUpdates) {
        const newVal = finalUpdates.Quotation_Discount;
        const prevVal = prevLead.Quotation_Discount;
        if ((newVal === null || newVal === undefined || (newVal as any) === '') && (prevVal !== null && prevVal !== undefined && (prevVal as any) !== '')) {
          console.warn(`[SAFETY] Prevented accidental overwrite of Quotation_Discount. Retaining existing data.`);
          finalUpdates.Quotation_Discount = prevVal;
        }
      }
    }

    if (prevLead && isExplicitStep3Save) {
      if ('Final_Package_Amount' in finalUpdates || 'final_package_amount' in finalUpdates || 'Final_Quotation_Amount' in finalUpdates) {
        const newVal = (finalUpdates as any).Final_Package_Amount ?? (finalUpdates as any).final_package_amount ?? (finalUpdates as any).Final_Quotation_Amount;
        if (newVal !== undefined && newVal !== null && !isNaN(Number(newVal))) {
          finalUpdates.Final_Package_Amount = Number(newVal);
          (finalUpdates as any).final_package_amount = Number(newVal);
          finalUpdates.Final_Quotation_Amount = Number(newVal);
        }
      }
    }

    let updatedEvents: LeadEvent[] | undefined;
    if ('events' in finalUpdates) {
      updatedEvents = finalUpdates.events;
      const notesToUse = finalUpdates.notes_special_customizations !== undefined 
        ? finalUpdates.notes_special_customizations 
        : (prevLead?.notes_special_customizations || '');
      // Serialize events to notes_special_customizations to prevent losing them during local cache updates or db falls
      finalUpdates.notes_special_customizations = serializeLeadEvents(updatedEvents || [], deserializeLeadEvents(notesToUse).notes);
      delete finalUpdates.events;
    }
    
    // Ensure total_pax and reference_source are always included in the update payload to satisfy validation
    if (prevLead) {
      if (!('total_pax' in finalUpdates)) {
        finalUpdates.total_pax = prevLead.total_pax || 0;
      }
      if (!('reference_source' in finalUpdates)) {
        finalUpdates.reference_source = prevLead.reference_source || '';
      }
    } else {
      if (!('total_pax' in finalUpdates)) {
        finalUpdates.total_pax = 0;
      }
      if (!('reference_source' in finalUpdates)) {
        finalUpdates.reference_source = '';
      }
    }
    
    const oldStatus = prevLead ? (prevLead.current_status || prevLead.status || 'New Lead') : 'New Lead';
    
    const anyStatus = finalUpdates.status || finalUpdates.current_status;
    if (anyStatus) {
      finalUpdates.status = anyStatus as CurrentStage;
      finalUpdates.current_status = anyStatus;
    }
    const res = await pushUpdate('leads', 'lead_id', leadId, { ...finalUpdates, updated_at: timestamp });
    if (!res?.success) {
      throw new Error(res?.error || "Failed to update lead in database.");
    }

    if (updatedEvents) {
      // 1. Load existing events from DB
      let existingEvents: any[] = [];
      try {
        if (supabaseClient) {
          const { data: dbEvents, error: fetchErr } = await supabaseClient.from('lead_events').select('id').eq('lead_id', leadId);
          if (!fetchErr && dbEvents) {
            existingEvents = dbEvents;
          }
        }
      } catch (e) {
        console.warn("[updateLead] Error fetching lead_events:", e);
      }
      
      const existingIds = existingEvents?.map(e => String(e.id)) || [];
      const incomingIds = updatedEvents.map(e => String(e.id)).filter(id => id && !id.startsWith('EV-'));

      // 2. Delete removed events
      const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        await Promise.all(idsToDelete.map(async (idToDelete) => {
          const delRes = await pushDelete('lead_events', 'id', idToDelete);
          if (!delRes?.success) {
            console.warn(`[updateLead] Failed to delete removed event ${idToDelete}:`, delRes?.error);
          }
        }));
      }

      // 3. Upsert (Insert new, Update existing)
      await Promise.all(updatedEvents.map(async (ev) => {
        const isNew = !ev.id || ev.id.startsWith('EV-') || !existingIds.includes(String(ev.id));
        
        const eventPayload: any = {
          lead_id: leadId,
          event_type: ev.event_type || '',
          event_name: ev.event_name || '',
          event_shoot_type: ev.event_shoot_type || '',
          event_date: ev.event_date || '',
          event_start_time: ev.event_start_time || '',
          event_end_time: ev.event_end_time || '',
          event_end_date: ev.event_end_date || (ev as any).Event_End_Date || null,
          event_location: ev.event_location || '',
          google_maps_link: ev.google_maps_link || '',
          guest_pax: String(ev.guest_pax) !== '' && ev.guest_pax != null ? Number(ev.guest_pax) : null,
          staff_pax: String(ev.staff_pax) !== '' && ev.staff_pax != null ? Number(ev.staff_pax) : null,
          assigned_staff_names: ev.assigned_staff_names || '',
          assigned_staff_mobiles: ev.assigned_staff_mobiles || '',
          reporting_date: ev.reporting_date || (ev as any).Reporting_date || null,
          reporting_time: ev.reporting_time || null
        };
        
        if (ev.id && !ev.id.startsWith('EV-') && isNew) {
           eventPayload.id = ev.id;
        }

        if (isNew) {
          const insRes = await pushInsert('lead_events', eventPayload);
          if (!insRes?.success) {
            console.warn(`[updateLead] Failed to insert new event:`, insRes?.error);
          }
        } else {
          const updRes = await pushUpdate('lead_events', 'id', ev.id, eventPayload);
          if (!updRes?.success) {
            console.warn(`[updateLead] Failed to update existing event:`, updRes?.error);
          }
        }
      }));
    }
    
    setLeads((prev) =>
      prev.map((ld) => {
        if (ld.lead_id === leadId) {
          const teamVal = (finalUpdates as any).Team_member ?? (finalUpdates as any).Team_Members ?? (finalUpdates as any).team_members ?? ld.Team_member ?? ld.Team_Members;
          const finalPkgVal = (finalUpdates as any).Final_Package_Amount ?? (finalUpdates as any).final_package_amount ?? (finalUpdates as any).Final_Quotation_Amount ?? ld.Final_Package_Amount ?? ld.final_package_amount ?? ld.Final_Quotation_Amount;
          const lostReasonVal = (finalUpdates as any).Lost_Reason ?? (finalUpdates as any).lost_reason ?? ld.Lost_Reason ?? ld.lost_reason;
          const lostNotesVal = (finalUpdates as any).Lost_Notes ?? (finalUpdates as any).lost_notes ?? ld.Lost_Notes ?? ld.lost_notes;
          const updated = {
            ...ld,
            ...finalUpdates,
            Lost_Reason: lostReasonVal,
            lost_reason: lostReasonVal,
            Lost_Notes: lostNotesVal,
            lost_notes: lostNotesVal,
            Final_Package_Amount: finalPkgVal !== undefined && finalPkgVal !== null && !isNaN(Number(finalPkgVal)) ? Number(finalPkgVal) : null,
            final_package_amount: finalPkgVal !== undefined && finalPkgVal !== null && !isNaN(Number(finalPkgVal)) ? Number(finalPkgVal) : undefined,
            Final_Quotation_Amount: finalPkgVal !== undefined && finalPkgVal !== null && !isNaN(Number(finalPkgVal)) ? Number(finalPkgVal) : null,
            Team_member: teamVal,
            Team_Members: teamVal,
            team_members: teamVal,
            updated_at: timestamp
          };
          const parsed = deserializeLeadEvents(updated.notes_special_customizations);
          updated.events = (updatedEvents && updatedEvents.length > 0) ? updatedEvents : (parsed.events || ld.events || []);
          return updated;
        }
        return ld;
      })
    );

    // Sync team members to linked orders in memory and database
    const incomingTeamVal = (finalUpdates as any).Team_member ?? (finalUpdates as any).Team_Members ?? (finalUpdates as any).team_members;
    if (incomingTeamVal !== undefined) {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.lead_id === leadId) {
            return {
              ...o,
              team_members: incomingTeamVal,
              Team_Members: incomingTeamVal,
              Team_member: incomingTeamVal,
              updated_at: timestamp
            };
          }
          return o;
        })
      );
      const linkedOrders = orders.filter(o => o.lead_id === leadId);
      for (const lo of linkedOrders) {
        pushUpdate('orders', 'order_id', lo.order_id, {
          team_members: incomingTeamVal,
          updated_at: timestamp
        }).catch(err => console.warn('Could not sync team_members to orders table', err));
      }
    }

    const newStatus = finalUpdates.current_status;
    if (newStatus && newStatus !== oldStatus) {
      const linkedOrder = orders.find(o => o.lead_id === leadId);
      const orderId = linkedOrder?.order_id || null;

      if (newStatus === 'Order Confirmed' && !orderId) {
        throw new Error(`"order_id" is required for "Order Confirmed" status, but it was not found or is missing.`);
      }
      
      const roleParts = (currentUserName && currentUserName.includes('|')) 
        ? currentUserName.split('|') 
        : [currentUserName || 'System', currentRole || 'System'];
      const changedBy = roleParts[0];
      const changedByRole = roleParts[1] || currentRole || 'System';
      
      const newHist = {
        lead_id: leadId,
        order_id: orderId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: changedBy,
        changed_by_role: changedByRole,
        remarks: finalUpdates.remarks || 'Status updated from CRM',
        created_at: timestamp
      };

      const resHist = await pushInsert('lead_status_history', newHist);
      if (!resHist?.success) {
        throw new Error(`"lead_status_history" insert failed. Error: ${resHist?.error || "Unknown error"}`);
      }
      setStatusHistory(prev => [...prev, newHist]);
    }

    
    return res;
  };

  const [unlockedRecords, setUnlockedRecords] = useState<UnlockOverride[]>(() => {
    const saved = localStorage.getItem('erp_unlocked_records');
    return saved ? JSON.parse(saved) : [];
  });

  const getLeadCurrentStatus = (lead: Lead): string => {
    let rawStatus = lead.current_status || lead.status || 'Create Quote';

    if (rawStatus === 'New Lead') {
      return 'Create Quote';
    }

    if (rawStatus === 'Created Quotation' || rawStatus === 'Create Quote') {
      return 'Create Quote';
    }

    if (rawStatus === 'Lost Lead' || rawStatus === 'Lead Lost') {
      return 'Lead Lost';
    }

    if (rawStatus === 'Order Confirmed' || rawStatus === 'Confirm Order') {
      return 'Confirm Order';
    }

    // Automatically transition Quote Sent -> Quote Follow-up if follow-up date/time reached
    if (rawStatus === 'Quote Sent' || rawStatus === 'Quotation Sent') {
      if (isFollowUpDateTimeReached(lead)) {
        return 'Quote Follow-up';
      }
      return 'Quote Sent';
    }

    return rawStatus;
  };

  const getLeadCurrentStage = (lead: Lead): 'Sales' | 'Operations' | 'Production' | 'Completed' => {
    const status = getLeadCurrentStatus(lead);
    
    const salesStatuses = ['New Lead', 'Contacted', 'Follow Up', 'Follow-up', 'Quote Sent', 'Quotation Sent', 'Quote Follow-up', 'Negotiation'];
    const opsStatuses = ['Confirm Order', 'Order Confirmed', 'New Order Received', 'Operations Assigned', 'Assigned Crew', 'Staff Assigned', 'Event Scheduled', 'Event Started', 'Event Start', 'Event Ended', 'Event End', 'Event Completed', 'Event Complete', 'Footage Handover', 'Equipment Handover', 'Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Event Cancelled'];
    const prodStatuses = ['Assigned Editor', 'Editor Assigned', 'Editing Started', 'Editing In Progress', 'Internal QC Review', 'Customer Review', 'Client Review Sent', 'Internal Review', 'Client Review', 'Revision Required', 'Revision In Progress', 'Revision', 'Client Acceptance', 'Final Approval', 'Approved', 'Ready for Delivery'];
    
    if (status === 'Delivered' || status === 'Completed' || status === 'Closed' || status === 'Project Closed' || status === 'Project Delivered') return 'Completed';
    if (prodStatuses.includes(status)) return 'Production';
    if (opsStatuses.includes(status)) return 'Operations';
    return 'Sales';
  };

  // RBAC Helper: Define allowed statuses per department
  const getDepartmentForStage = (stage: CurrentStage): Department | undefined => {
    for (const [dept, stages] of Object.entries(DEPARTMENT_STAGES)) {
      if (stages.includes(stage)) return dept as Department;
    }
    return undefined;
  };

  const isDepartmentAllowedToEdit = (role: UserRole, stage: CurrentStage): boolean => {
    const userDepts = ROLE_DEPARTMENT_MAP[role] || [];
    return Object.entries(DEPARTMENT_STAGES).some(([dept, stages]) => {
      return stages.includes(stage) && userDepts.includes(dept as Department);
    });
  };

  const unlockRecord = (recordId: string, module: 'Sales' | 'Operations' | 'Production', reason: string) => {
    const newUnlock: UnlockOverride = {
      recordId,
      unlockedBy: currentUserName || 'Business Owner',
      unlockDate: new Date().toISOString(),
      reason,
      module
    };
    const updated = [...unlockedRecords, newUnlock];
    setUnlockedRecords(updated);
    localStorage.setItem('erp_unlocked_records', JSON.stringify(updated));

    logActivity(`Unlocked ${module} Record for ${recordId}. Reason: ${reason}`, 'UserManagement', recordId);
    
    // Add a specific log log entry to activity logs if needed, also can trigger refresh
    // fetchFromDb().catch(console.error); // Disabled to prevent full reload
  };

  const lockRecord = (recordId: string, module: 'Sales' | 'Operations' | 'Production') => {
    const updated = unlockedRecords.filter(r => !(r.recordId === recordId && r.module === module));
    setUnlockedRecords(updated);
    localStorage.setItem('erp_unlocked_records', JSON.stringify(updated));

    logActivity(`Locked ${module} Record for ${recordId}`, 'UserManagement', recordId);
  };

  const isRecordLocked = (recordId: string, module: 'Sales' | 'Operations' | 'Production'): boolean => {
    const override = unlockedRecords.find(r => r.recordId === recordId && r.module === module);
    if (override) {
      return false;
    }

    if (module === 'Sales') {
      const lead = leads.find(l => l.lead_id === recordId);
      if (!lead) return false;
      const salesStages = ['New Lead', 'Contacted', 'Follow Up', 'Follow-up', 'Quotation Sent', 'Negotiation', 'Lost Lead'];
      return !salesStages.includes(lead.status);
    }

    if (module === 'Operations') {
      let orderId = recordId;
      const op = operations.find(o => o.operation_id === recordId || o.order_id === recordId);
      if (op) {
        orderId = op.order_id;
      }
      const order = augmentedOrders.find(o => o.order_id === orderId);
      if (!order) {
        const lead = leads.find(l => l.lead_id === recordId);
        if (lead && lead.status === 'Raw Footage Received') return true;
        return false;
      }
      const preRawFootageStages = [
        'New Lead', 'Follow Up', 'Quotation Sent', 'Negotiation', 'Confirm Order', 'Order Confirmed',
        'New Order Received', 'Operations Assigned', 'Assigned Crew', 'Event Scheduled', 'Staff Assigned', 'Event Started', 'Event Completed',
        'Footage Handover Verified', 'Raw Footage Received'
      ];
      return !preRawFootageStages.includes(order.current_stage);
    }

    if (module === 'Production') {
      const prodItem = augmentedProduction.find(p => p.production_id === recordId || p.tracking_id === recordId);
      if (!prodItem) {
        const order = augmentedOrders.find(o => o.order_id === recordId);
        if (order) {
          return order.current_stage === 'Project Closed' || order.current_stage === 'Completed' || order.current_stage === 'Closed';
        }
        const lead = leads.find(l => l.lead_id === recordId);
        if (lead) {
          return lead.status === 'Project Closed' || lead.status === 'Completed' || lead.status === 'Closed';
        }
        return false;
      }
      return prodItem.production_status === 'Closed';
    }

    return false;
  };

  const deleteOrderCommon = async (orderId: string, showAlert: boolean): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      // 1. Delete associated payments
      await supabaseClient.from('payments').delete().eq('order_id', orderId);
      // 2. Delete associated operations
      await supabaseClient.from('operations').delete().eq('order_id', orderId);
      // 3. Delete associated staff assignments
      await supabaseClient.from('staff_assignments').delete().eq('order_id', orderId);

      // 4. Delete associated raw footage & production & editor assignments
      const { data: linkedFootage } = await supabaseClient.from('raw_footage').select('tracking_id').eq('order_id', orderId);
      if (linkedFootage && linkedFootage.length > 0) {
        const trackingIds = linkedFootage.map(rf => rf.tracking_id);
        
        // Find production IDs
        const { data: linkedProduction } = await supabaseClient.from('production').select('production_id').in('tracking_id', trackingIds);
        if (linkedProduction && linkedProduction.length > 0) {
          const prodIds = linkedProduction.map(p => p.production_id);
          // Delete editor assignments
          await supabaseClient.from('editor_assignments').delete().in('production_id', prodIds);
          // Delete production rows
          await supabaseClient.from('production').delete().in('production_id', prodIds);
        }
        // Delete raw footage rows
        await supabaseClient.from('raw_footage').delete().eq('order_id', orderId);
      }

      // Delete order-related history
      await supabaseClient.from('lead_status_history').delete().eq('order_id', orderId);
      await supabaseClient.from('lead_staff_assignment_history').delete().eq('order_id', orderId);
      await supabaseClient.from('lead_equipment_history').delete().eq('order_id', orderId);
      await supabaseClient.from('lead_editor_assignment_history').delete().eq('order_id', orderId);

      // Delete the order itself
      const { error } = await supabaseClient.from('orders').delete().eq('order_id', orderId);
      if (error) throw error;

      // 2. Update React states
      setOrders(prev => prev.filter(o => o.order_id !== orderId));
      setPayments(prev => prev.filter(p => p.order_id !== orderId));
      setOperations(prev => prev.filter(op => op.order_id !== orderId));
      setStaffAssignments(prev => prev.filter(sa => sa.order_id !== orderId));
      
      if (linkedFootage && linkedFootage.length > 0) {
        const trackingIds = linkedFootage.map(rf => rf.tracking_id);
        setRawFootage(prev => prev.filter(rf => rf.order_id !== orderId));
        setProduction(prev => prev.filter(p => !trackingIds.includes(p.tracking_id)));
      }

      // Clean up local fallback storage
      const localKey = 'erp_local_orders';
      const existingLocalStr = localStorage.getItem(localKey);
      if (existingLocalStr) {
        const localRecords = JSON.parse(existingLocalStr);
        const filtered = localRecords.filter((r: any) => r.order_id !== orderId);
        localStorage.setItem(localKey, JSON.stringify(filtered));
      }

      if (showAlert) {
        alert('Order and all associated operational records deleted successfully!');
      }
      logActivity(`Deleted Order: ${orderId}`, 'Sales', orderId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete order:', err);
      if (showAlert) {
        alert(`Error deleting order: ${err.message || err}`);
      }
      return false;
    }
  };

  const deleteLead = async (leadId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      // 1. Delete child tables in Supabase first to prevent constraint issues
      await pushDelete('lead_events', 'lead_id', leadId);
      await supabaseClient.from('lead_packages').delete().eq('lead_id', leadId);
      await supabaseClient.from('quotations').delete().eq('lead_id', leadId);
      await supabaseClient.from('follow_ups').delete().eq('lead_id', leadId);
      await supabaseClient.from('lead_status_history').delete().eq('lead_id', leadId);
      await supabaseClient.from('lead_staff_assignment_history').delete().eq('lead_id', leadId);
      await supabaseClient.from('lead_equipment_history').delete().eq('lead_id', leadId);
      await supabaseClient.from('lead_editor_assignment_history').delete().eq('lead_id', leadId);

      // Delete associated orders and their children
      const { data: linkedOrders } = await supabaseClient.from('orders').select('order_id').eq('lead_id', leadId);
      if (linkedOrders && linkedOrders.length > 0) {
        for (const o of linkedOrders) {
          await deleteOrderCommon(o.order_id, false);
        }
      }

      // Delete the lead itself
      const { error } = await supabaseClient.from('leads').delete().eq('lead_id', leadId);
      if (error) throw error;

      // 2. Update React States
      setLeads(prev => prev.filter(l => l.lead_id !== leadId));
      setQuotations(prev => prev.filter(q => q.lead_id !== leadId));
      setLeadPackages(prev => prev.filter(lp => lp.lead_id !== leadId));

      // Clean up local fallback storage
      const localKey = 'erp_local_leads';
      const existingLocalStr = localStorage.getItem(localKey);
      if (existingLocalStr) {
        const localRecords = JSON.parse(existingLocalStr);
        const filtered = localRecords.filter((r: any) => r.lead_id !== leadId);
        localStorage.setItem(localKey, JSON.stringify(filtered));
      }

      alert('Lead deleted successfully!');
      logActivity(`Deleted Lead: ${leadId}`, 'Sales', leadId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete lead:', err);
      alert(`Error deleting lead: ${err.message || err}`);
      return false;
    }
  };

  const deleteOrder = (orderId: string) => deleteOrderCommon(orderId, true);

  const deleteFollowUp = async (followUpId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient.from('follow_ups').delete().eq('follow_up_id', followUpId);
      if (error) throw error;
      alert('Follow-up record deleted successfully!');
      logActivity(`Deleted Follow Up: ${followUpId}`, 'Sales', followUpId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete follow up:', err);
      alert(`Error deleting follow up: ${err.message || err}`);
      return false;
    }
  };

  const deleteQuotation = async (quotationId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient.from('quotations').delete().eq('quotation_id', quotationId);
      if (error) throw error;
      setQuotations(prev => prev.filter(q => q.quotation_id !== quotationId));
      alert('Quotation deleted successfully!');
      logActivity(`Deleted Quotation: ${quotationId}`, 'Sales', quotationId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete quotation:', err);
      alert(`Error deleting quotation: ${err.message || err}`);
      return false;
    }
  };

  const deletePayment = async (paymentId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient.from('payments').delete().eq('payment_id', paymentId);
      if (error) throw error;
      setPayments(prev => prev.filter(p => p.payment_id !== paymentId));
      alert('Payment record deleted successfully!');
      logActivity(`Deleted Payment: ${paymentId}`, 'Payments', paymentId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete payment:', err);
      alert(`Error deleting payment: ${err.message || err}`);
      return false;
    }
  };

  const deleteOperation = async (operationId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient.from('operations').delete().eq('operation_id', operationId);
      if (error) throw error;
      setOperations(prev => prev.filter(o => o.operation_id !== operationId));
      alert('Operational record deleted successfully!');
      logActivity(`Deleted Operation: ${operationId}`, 'Operations', operationId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete operation:', err);
      alert(`Error deleting operation: ${err.message || err}`);
      return false;
    }
  };

  const deleteProduction = async (productionId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      // Delete editor assignments first
      await supabaseClient.from('editor_assignments').delete().eq('production_id', productionId);
      const { error } = await supabaseClient.from('production').delete().eq('production_id', productionId);
      if (error) throw error;
      setProduction(prev => prev.filter(p => p.production_id !== productionId));
      setEditorAssignments(prev => prev.filter(ea => ea.production_id !== productionId));
      alert('Production record deleted successfully!');
      logActivity(`Deleted Production: ${productionId}`, 'Production', productionId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete production:', err);
      alert(`Error deleting production: ${err.message || err}`);
      return false;
    }
  };

  const deleteStaffAssignment = async (assignmentId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      const { error } = await supabaseClient.from('staff_assignments').delete().eq('assignment_id', assignmentId);
      if (error) throw error;
      setStaffAssignments(prev => prev.filter(sa => sa.assignment_id !== assignmentId));
      alert('Staff assignment deleted successfully!');
      logActivity(`Deleted Staff Assignment: ${assignmentId}`, 'Operations', assignmentId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete staff assignment:', err);
      alert(`Error deleting staff assignment: ${err.message || err}`);
      return false;
    }
  };

  const deleteRawFootage = async (trackingId: string): Promise<boolean> => {
    if (!supabaseClient) return false;
    try {
      // Find production IDs
      const { data: linkedProduction } = await supabaseClient.from('production').select('production_id').eq('tracking_id', trackingId);
      if (linkedProduction && linkedProduction.length > 0) {
        const prodIds = linkedProduction.map(p => p.production_id);
        // Delete editor assignments
        await supabaseClient.from('editor_assignments').delete().in('production_id', prodIds);
        // Delete production rows
        await supabaseClient.from('production').delete().in('production_id', prodIds);
        setProduction(prev => prev.filter(p => !prodIds.includes(p.production_id)));
        setEditorAssignments(prev => prev.filter(ea => !prodIds.includes(ea.production_id)));
      }
      const { error } = await supabaseClient.from('raw_footage').delete().eq('tracking_id', trackingId);
      if (error) throw error;
      setRawFootage(prev => prev.filter(rf => rf.tracking_id !== trackingId));
      alert('Raw footage record deleted successfully!');
      logActivity(`Deleted Raw Footage: ${trackingId}`, 'Production', trackingId);
      // fetchFromDb().catch(console.error); // Disabled to prevent full reload
      return true;
    } catch (err: any) {
      console.error('Failed to delete raw footage:', err);
      alert(`Error deleting raw footage: ${err.message || err}`);
      return false;
    }
  };

  // Automatic Reminder Notifications for Event Dates & Target Delivery Dates
  useEffect(() => {
    if (isDataLoading) return;
    if (isCheckingRemindersRef.current) return;

    const checkAndGenerateReminders = async () => {
      isCheckingRemindersRef.current = true;
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const nowMs = Date.now();
        
        const getDaysDiff = (targetDateStr: string, todayDateStr: string) => {
          const d1 = new Date(targetDateStr);
          const d2 = new Date(todayDateStr);
          d1.setHours(0,0,0,0);
          d2.setHours(0,0,0,0);
          const diffTime = d1.getTime() - d2.getTime();
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        };

        // Load deleted notification IDs to avoid recreation
        let deletedIds: string[] = [];
        try {
          const deletedStr = localStorage.getItem('erp_deleted_notifications');
          if (deletedStr) {
            deletedIds = JSON.parse(deletedStr);
          }
        } catch (e) {
          console.warn("Error parsing deleted notifications:", e);
        }

        const newlyAddedIds = new Set<string>();
        const pendingReminders: any[] = [];

        // A. EVENT REMINDERS (for Sales Team, Operations Team, Business Owner)
        for (const order of augmentedOrders) {
          const eventDateStr = order.event_date;
          if (!eventDateStr) continue;

          const cleanEventDateStr = eventDateStr.split('T')[0];
          const daysDiff = getDaysDiff(cleanEventDateStr, todayStr);

          const isEventCompleted = order.current_stage === 'Event Completed' || order.current_stage === 'Closed' || order.current_stage === 'Raw Footage Received';
          if (isEventCompleted) continue;

          const customerName = order.customer_name || 'Valued Client';
          const eventType = order.event_type || order.package_name || 'Event';
          const orderIdValue = order.order_id;

          // Reminder thresholds: 7 days, 3 days, 1 day, 0 days (Event Day)
          const thresholds = [
            { days: 7, label: '7 Days Before' },
            { days: 3, label: '3 Days Before' },
            { days: 1, label: '1 Day Before' },
            { days: 0, label: 'Event Day' }
          ];

          for (const t of thresholds) {
            if (daysDiff === t.days) {
              const roles = ['Sales Team', 'Operations Team', 'Business Owner'];
              for (const role of roles) {
                const prefix = role.replace(/\s+/g, '');
                const notifId = `NTF-rem-event-${orderIdValue}-${prefix}-${t.days}`;
                const exists = notifications.some(n => n.notification_id === notifId) || deletedIds.includes(notifId) || newlyAddedIds.has(notifId);
                
                if (!exists) {
                  newlyAddedIds.add(notifId);
                  let title = '';
                  let message = '';
                  
                  if (role === 'Sales Team' || role === 'Business Owner') {
                    title = `📅 Event Reminder (${t.label})`;
                    message = `Event scheduled for **${customerName}** (${eventType}) is coming up in ${t.days === 0 ? 'TODAY' : t.days + ' days'} (Date: ${cleanEventDateStr}).`;
                  } else if (role === 'Operations Team') {
                    title = `📅 Event Schedule Reminder (${t.label})`;
                    message = `Operations Reminder: Event for **${customerName}** is scheduled in ${t.days === 0 ? 'TODAY' : t.days + ' days'}. Please verify staff assignments and kit readiness!`;
                  }

                  pendingReminders.push({
                    notification_id: notifId,
                    title,
                    message,
                    recipient_role: role,
                    task_id: 'Event Reminder',
                    notification_type: role === 'Operations Team' ? 'Event Schedule Reminder' : 'Event Reminder',
                    project_id: orderIdValue,
                    priority: t.days <= 1 ? 'High' : 'Medium'
                  });
                }
              }
            }
          }
        }

        // B. PRODUCTION / DELIVERY REMINDERS (for Production Team)
        for (const p of augmentedProduction) {
          const targetDateStr = p.expected_delivery_date || p.target_delivery_date;
          if (!targetDateStr) continue;

          const cleanDateStr = targetDateStr.split('T')[0];
          const daysDiff = getDaysDiff(cleanDateStr, todayStr);

          // Find customer name
          const ord = augmentedOrders.find(o => o.order_id === p.tracking_id || o.lead_id === p.tracking_id);
          const parentLead = leads.find(l => l.lead_id === p.tracking_id || (ord && l.lead_id === ord.lead_id));
          const customerName = ord?.customer_name || parentLead?.customer_name || 'Customer';
          const orderIdValue = ord?.order_id || p.tracking_id || 'N/A';

          const isDelivered = p.editing_status === 'Delivered' || p.editing_status === 'Closed' || p.editing_status === 'Approved' || p.editing_status === 'Final Approval';
          if (isDelivered) continue;

          // Delivery reminder thresholds: 7 days, 3 days, 1 day, 0 days, overdue (daysDiff < 0)
          const deliveryThresholds = [
            { days: 7, label: '7 Days Before Delivery', title: 'Target Delivery Reminder', priority: 'Medium' },
            { days: 3, label: '3 Days Before Delivery', title: 'Target Delivery Reminder', priority: 'High' },
            { days: 1, label: '1 Day Before Delivery', title: 'Target Delivery Reminder', priority: 'High' },
            { days: 0, label: 'Delivery Due Today', title: 'Delivery Due Today', priority: 'Critical' }
          ];

          for (const t of deliveryThresholds) {
            if (daysDiff === t.days) {
              const notifId = `NTF-rem-prod-${p.production_id}-${t.days}`;
              const exists = notifications.some(n => n.notification_id === notifId) || deletedIds.includes(notifId) || newlyAddedIds.has(notifId);
              
              if (!exists) {
                newlyAddedIds.add(notifId);
                pendingReminders.push({
                  notification_id: notifId,
                  title: t.title,
                  message: `Project for **${customerName}** is due for delivery ${t.days === 0 ? 'TODAY' : 'in ' + t.days + ' days'} (Date: ${cleanDateStr}).`,
                  recipient_role: 'Production Team',
                  task_id: 'Delivery Reminder',
                  notification_type: 'Target Delivery Reminder',
                  project_id: orderIdValue,
                  priority: t.priority
                });
              }
            }
          }

          // Overdue Delivery
          if (daysDiff < 0) {
            const notifId = `NTF-rem-prod-${p.production_id}-overdue`;
            const exists = notifications.some(n => n.notification_id === notifId) || deletedIds.includes(notifId) || newlyAddedIds.has(notifId);
            
            if (!exists) {
              newlyAddedIds.add(notifId);
              pendingReminders.push({
                notification_id: notifId,
                title: 'Delivery Overdue',
                message: `Project for **${customerName}** is OVERDUE! The target delivery date was ${cleanDateStr}.`,
                recipient_role: 'Production Team',
                task_id: 'Delivery Reminder',
                notification_type: 'Delivery Overdue',
                project_id: orderIdValue,
                priority: 'Critical'
              });
            }
          }
        }

        // Bulk create all pending reminders in ONE go
        if (pendingReminders.length > 0) {
          console.log(`[Reminders] Generating ${pendingReminders.length} automatic reminder notifications in bulk...`);
          
          const mappedReminders = pendingReminders.map(rem => {
            const notification_id = rem.notification_id || `NTF-${6001 + Math.floor(Math.random() * 10000)}`;
            return {
              ...rem,
              notification_id,
              created_at: new Date().toISOString(),
              read_status: false,
              is_read: false,
              is_archived: false
            };
          });

          // 1. Optimistic UI Update: add them all to local state in one single render cycle
          setNotifications(prev => [...mappedReminders, ...prev]);

          // 2. Save them all to Supabase in a single bulk insert request
          if (supabaseClient) {
            const dbPayloads = mappedReminders.map(notif => ({
              notification_id: notif.notification_id,
              recipient_role: notif.recipient_role || 'All',
              title: notif.title,
              message: notif.message,
              is_read: notif.read_status,
              user_id: notif.user_id || null,
              project_id: notif.project_id || null,
              task_id: notif.task_id || null,
              notification_type: notif.notification_type || null,
              read_status: notif.read_status,
              priority: notif.priority || 'Medium',
              recipient_user_id: notif.recipient_user_id || null,
              recipient_email: notif.recipient_email || null,
              sender_user_id: notif.sender_user_id || null,
              sender_name: notif.sender_name || null,
              related_table: notif.related_table || null,
              related_record_id: notif.related_record_id || null,
              action_url: notif.action_url || null,
              is_archived: false,
              read_at: notif.read_at || null,
              expires_at: notif.expires_at || null,
              created_at: notif.created_at
            }));

            try {
              const { error } = await supabaseClient.from('notifications').insert(dbPayloads);
              if (error) {
                console.warn("[Reminders] Bulk insert failed, falling back to individual inserts:", error);
                // Fallback: insert one-by-one if bulk fails for schema mismatch
                for (const rem of mappedReminders) {
                  await saveNotificationToSupabase(rem);
                }
              } else {
                console.log("[Reminders] Bulk insert completed successfully.");
              }
            } catch (err) {
              console.warn("[Reminders] Bulk insert error:", err);
            }
          }
        }
      } finally {
        isCheckingRemindersRef.current = false;
      }
    };

    checkAndGenerateReminders().catch(e => {
      console.warn("checkAndGenerateReminders error:", e);
      isCheckingRemindersRef.current = false;
    });
  }, [isDataLoading, augmentedProduction, notifications, augmentedOrders, leads]);

  const isTerminalStatusValue = (s?: string) => {
    const val = String(s || '').trim().toLowerCase();
    return val === 'order closed' || val === 'order close' || val === 'closed' || val === 'close' || val === 'project closed' || val === 'completed' || val === 'project completed';
  };

  const isTerminalRecord = (item: any, trackingId: string) => {
    if (!item) return false;
    if (isTerminalStatusValue(item.status) || 
        isTerminalStatusValue(item.current_status) || 
        isTerminalStatusValue(item.current_stage) || 
        isTerminalStatusValue(item.editing_status) || 
        isTerminalStatusValue(item.production_status)) {
      return true;
    }
    const p = augmentedProduction.find(
      prod => prod.tracking_id === trackingId || 
              prod.production_id === trackingId || 
              prod.order_id === trackingId || 
              prod.lead_id === trackingId
    );
    if (p) {
      if (isTerminalStatusValue(p.editing_status) || 
          isTerminalStatusValue(p.production_status) || 
          isTerminalStatusValue(p.current_status)) {
        return true;
      }
    }
    return false;
  };

  const visibleLeads = useMemo(() => {
    let baseLeads = leads;
    if (currentRole === 'Sales Team' && currentUser) {
      baseLeads = leads.filter(l => 
        l.sales_person === currentUserName || 
        l.created_by === currentUserName || 
        l.sales_staff_id === currentUser.id
      );
    }
    return baseLeads;
  }, [leads, currentRole, currentUser, currentUserName]);

  const visibleOrders = useMemo(() => {
    let baseOrders = augmentedOrders;
    if (currentRole === 'Sales Team' && currentUser) {
      const allowedLeadIds = new Set(visibleLeads.map(l => l.lead_id));
      baseOrders = augmentedOrders.filter(o => allowedLeadIds.has(o.lead_id));
    }
    return baseOrders;
  }, [augmentedOrders, currentRole, visibleLeads, currentUser]);

  const visiblePayments = useMemo(() => {
    if (currentRole === 'Sales Team' && currentUser) {
      const allowedOrderIds = new Set(visibleOrders.map(o => o.order_id));
      return augmentedPayments.filter(p => allowedOrderIds.has(p.order_id));
    }
    return augmentedPayments;
  }, [augmentedPayments, currentRole, visibleOrders, currentUser]);

  return (
    <RoleContext.Provider
      value={{
        currentUser,
        currentRole,
        currentUserName,
        setCurrentRole,
        setCurrentUserName,
        isDataLoading,
        login,
        logout,
        users,
        leads: visibleLeads,
        allLeads: leads,
        orders: visibleOrders,
        allOrders: augmentedOrders,
        operations: augmentedOperations,
        rawFootage,
        production: augmentedProduction,
        payments: visiblePayments,
        logs,
        staff,
        addStaff,
        updateStaff,
        deleteStaff,
        productionStaff,
        addProductionStaff,
        updateProductionStaff,
        deleteProductionStaff,
        equipment,
        addEquipment,
        updateEquipment,
        deleteEquipment,
        notifications,
        addNotification,
        markNotificationRead,
        markAllNotificationsRead,
        deleteNotification,
        deleteAllReadNotifications,
        archiveNotification,
        calendarMemos,
        addCalendarMemo,
        updateCalendarMemo,
        deleteCalendarMemo,
        leadPackages,
        packages,
        addPackage,
        updatePackage,
        deletePackage,
        quotations,
        addQuotation,
        updateQuotation,
        updateLead,
        saveLeadPackages,
        addLead,
        updateLeadFollowUp,
        confirmOrder,
        assignOperations,
        markEventCompleted,
        confirmRawFootageReceived,
        updateOrderStage,
        acceptRawFootage,
        updateProduction,
        markDelivered,
        recordPayment,
        resetAllData,
        refreshData,
        pushInsert,
        pushUpsert,
        pushUpdate,
        statusHistory,
        getLeadCurrentStatus,
        getLeadCurrentStage,
        addUser,
        signUpUser,
        editUser,
        deleteUser,
        toggleUserStatus,
        resetUserPassword,
        staffAssignments,
        leadStaffAssignmentHistory,
        leadEquipmentHistory,
        addLeadEquipmentHistory,
        saveStaffAssignments,
        specialities,
        addSpeciality,
        updateSpeciality,
        deactivateSpeciality,
        deleteSpeciality,
        editorAssignments: augmentedEditorAssignments,
        assignEditorToProject,
        updateEditorAssignmentStatus,
        updateEditorAssignment,
        deleteEditorAssignment,
        globalDateRange,
        setGlobalDateRange,
        resetGlobalDateRange,
        equipmentHandovers,
        addEquipmentHandover,
        addEquipmentHandovers,
        unlockedRecords,
        getDepartmentForStage,
        isDepartmentAllowedToEdit,
        unlockRecord,
        lockRecord,
        isRecordLocked,
        deleteLead,
        deleteOrder,
        deleteFollowUp,
        deleteQuotation,
        deletePayment,
        deleteOperation,
        deleteProduction,
        deleteStaffAssignment,
        deleteRawFootage,
        clientAcceptanceVerifications,
        saveClientAcceptanceVerification,
        isProductionDashboardActive,
        setIsProductionDashboardActive,
        getStaffCurrentPassword: (member: any) => getStaffCurrentPassword(member, users),
        fetchStaffCurrentPassword: (member: any) => fetchStaffCurrentPassword(member, users),
        paymentHistory,
        approvePayment,
        rejectPayment,
      }}
    >
      {children}
      
      {/* Premium responsive Custom Dialog popup replacing native browser alerts */}
      {globalModalAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-[4px] animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-850 rounded-3xl p-6 w-full max-w-sm w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Top gold calibrator ribbon decorator */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 animate-pulse" />
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  globalModalAlert.title === 'Operation Successful'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : globalModalAlert.title === 'Action Required'
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                }`}>
                  {globalModalAlert.title === 'Operation Successful' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : globalModalAlert.title === 'Action Required' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h4 className="text-[11px] font-mono font-bold tracking-widest uppercase text-zinc-350">
                    {globalModalAlert.title}
                  </h4>
                  <p className="text-[9px] text-zinc-550 uppercase font-mono tracking-wider">
                    Studio Desk Feedback
                  </p>
                </div>
              </div>
              
              <div className="h-px bg-zinc-900" />
              
              <p className="text-xs text-zinc-300 font-sans leading-relaxed break-words whitespace-pre-wrap">
                {globalModalAlert.message}
              </p>
              
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setGlobalModalAlert(null)}
                  className="w-full px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-750 text-zinc-200 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer text-center select-none duration-150"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
};
