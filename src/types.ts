/**
 * Photo Crew ERP Type Declarations
 */

export type UserRole = 'Business Owner' | 'Sales Team' | 'Operations Team' | 'Production Team' | 'Operation Staff' | 'Production Staff';


export const ACTIVE_STAGE_GROUPS = [
  {
    label: "Sales Statuses",
    colorClass: "text-emerald-400",
    options: [
      { value: "Create Quote", label: "Create Quote" },
      { value: "Quote Sent", label: "Quote Sent" },
      { value: "Quote Follow-up", label: "Quote Follow-up" },
      { value: "Confirm Order", label: "Confirm Order" },
      { value: "Lead Lost", label: "Lead Lost" }
    ]
  },
  {
    label: "Operations Statuses",
    colorClass: "text-amber-400",
    options: [
      { value: "Order Confirmed", label: "Order Confirmed" },
      { value: "Assigned Crew", label: "Assigned Crew" },
      { value: "Event Started", label: "Event Started" },
      { value: "Event Ended", label: "Event Ended" },
      { value: "Footage Handover", label: "Footage Handover" },
      { value: "Verified Footage", label: "Verified Footage" },
      { value: "Event Cancelled", label: "Event Cancelled" }
    ]
  },
  {
    label: "Production Statuses",
    colorClass: "text-indigo-400",
    options: [
      { value: "Verified Footage", label: "Verified Footage" },
      { value: "Assigned Editor", label: "Assigned Editor" },
      { value: "Editing Started", label: "Editing Started" },
      { value: "Customer Review", label: "Customer Review" },
      { value: "Editing Completed", label: "Editing Completed" },
      { value: "Client Acceptance", label: "Client Acceptance" },
      { value: "Client Accepted", label: "Client Accepted" },
      { value: "Order Closed", label: "Order Closed" }
    ]
  }
];
export const EVENT_TYPES = [
  'Weddings',
  'Hamarlok Weddings',
  'Engagement',
  'Pre Weddings',
  'Maternity',
  'Baby Shower',
  'New Born',
  'Baby Shoot',
  'Birthday',
  'Naming Ceremony',
  'House Warming',
  'Upanayana',
  'Half Saree',
  'Portfolio',
  'Product Shoot',
  'Corporate Events',
  'Car Shoot',
  'Bike Shoot',
  'Other'
];

export const PACKAGE_CATEGORIES = [
  'Weddings',
  'Hamarlok Weddings',
  'Engagement',
  'Pre Weddings',
  'Maternity',
  'Baby Shower',
  'New Born',
  'Baby Shoot',
  'Birthday',
  'Naming Ceremony',
  'House Warming',
  'Upanayana',
  'Half Saree',
  'Portfolio',
  'Product Shoot',
  'Corporate Events',
  'Car Shoot',
  'Bike Shoot'
];

export type Department = 'Sales' | 'Operations' | 'Production' | 'Editor' | 'Dispatch';

export const DEPARTMENT_STAGES: Record<Department, CurrentStage[]> = {
  Sales: ['Create Quote', 'Created Quotation', 'Quote Sent', 'Quote Follow-up', 'Confirm Order', 'Lead Lost', 'New Lead', 'Contacted', 'Follow Up', 'Follow-up', 'Quotation Sent', 'Negotiation', 'Order Confirmed', 'Lost Lead'],
  Operations: ['Confirm Order', 'Order Confirmed', 'Operations Assigned', 'Assigned Crew', 'Staff Assigned', 'Event Scheduled', 'Event Started', 'Event Completed', 'Event Ended', 'Footage Handover', 'Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Event Cancelled'],
  Production: ['Verified Footage', 'Footage Handover Verified', 'Raw Footage Received', 'Assigned Editor', 'Editor Assigned', 'Editing Started', 'Editing In Progress', 'Internal QC Review', 'Customer Review', 'Client Review Sent', 'Revision Required', 'Revision In Progress', 'Client Acceptance', 'Final Approval', 'Approved', 'Project Delivered', 'Completed', 'Business Owner Review', 'Order Closed', 'Closed'],
  Editor: ['Assigned Editor', 'Editor Assigned', 'Editing Started', 'Customer Review', 'Client Review Sent', 'Client Acceptance', 'Revision Required', 'Approved', 'Completed'],
  Dispatch: ['Delivered', 'Payment Pending', 'Business Owner Review', 'Order Closed', 'Closed']
};

export const ROLE_DEPARTMENT_MAP: Record<UserRole, Department[]> = {
  'Business Owner': ['Sales', 'Operations', 'Production', 'Editor', 'Dispatch'],
  'Sales Team': ['Sales'],
  'Operations Team': ['Operations'],
  'Production Team': ['Production', 'Editor', 'Dispatch'],
  'Operation Staff': ['Operations'],
  'Production Staff': ['Production', 'Editor']
};

export type CurrentStage =
  | 'Create Quote'
  | 'Created Quotation'
  | 'Quote Sent'
  | 'Quote Follow-up'
  | 'Confirm Order'
  | 'Lead Lost'
  | 'New Lead'
  | 'Contacted'
  | 'Follow Up'
  | 'Follow-up'
  | 'Quote Sent'
  | 'Quotation Sent'
  | 'Quote Follow-up'
  | 'Negotiation'
  | 'Confirm Order'
  | 'Order Confirmed'
  | 'Lost Lead'
  | 'New Order Received'
  | 'Operations Assigned'
  | 'Assigned Crew'
  | 'Event Scheduled'
  | 'Staff Assigned'
  | 'Event Started'
  | 'Event Completed'
  | 'Event Ended'
  | 'Footage Handover'
  | 'Verified Footage'
  | 'Footage Handover Verified'
  | 'Raw Footage Received'
  | 'Assigned Editor'
  | 'Editor Assigned'
  | 'Editing Started'
  | 'Editing In Progress'
  | 'Internal QC Review'
  | 'Customer Review'
  | 'Client Review Sent'
  | 'Revision Required'
  | 'Revision In Progress'
  | 'Editing Completed'
  | 'Editing Complete'
  | 'Client Acceptance'
  | 'Client Accepted'
  | 'Final Approval'
  | 'Project Delivered'
  | 'Project Closed'
  | 'Approved'
  | 'Delivered'
  | 'Payment Pending'
  | 'Event Cancelled'
  | 'Completed'
  | 'Business Owner Review'
  | 'Order Closed'
  | 'Closed';

export type EditingStatus = 'Footage Handover Verified' | 'Raw Footage Received' | 'Assigned Editor' | 'Editor Assigned' | 'Editing Started' | 'Editing In Progress' | 'Internal QC Review' | 'Customer Review' | 'Client Review Sent' | 'Revision Required' | 'Revision In Progress' | 'Editing Completed' | 'Editing Complete' | 'Client Acceptance' | 'Client Accepted' | 'Final Approval' | 'Project Delivered' | 'Client Review' | 'Project Completed' | 'Completed' | 'Business Owner Review' | 'Order Closed' | 'Closed';

export type PaymentStatus = 'Pending' | 'Partially Paid' | 'Fully Paid' | 'Waiting for Approval';

export interface User {
  id: string;
  name: string;
  full_name?: string;
  mobile: string;
  email: string;
  role: UserRole;
  active: boolean;
  status?: string;
  created_at: string;
  password?: string;
  username?: string;
  employee_id?: string;
}

export interface LeadEvent {
  id: string;
  event_type?: string;
  event_name: string;
  event_date: string;
  event_start_date: string;
  event_end_date: string;
  Event_End_Date?: string;
  event_location: string;
  event_shoot_type: string;
  guest_pax: number;
  staff_pax: number;
  event_start_time?: string;
  event_time?: string;
  event_end_time?: string;
  google_maps_link?: string;
  assigned_staff_names?: string;
  assigned_staff_mobiles?: string;
  reporting_date?: string;
  reporting_time?: string;
}

export interface Lead {
  lead_id: string;
  customer_id?: string;
  created_date: string;
  created_at?: string;
  lead_source: string;
  customer_name: string;
  mobile: string;
  alternate_mobile?: string;
  email: string;
  event_type: string;
  custom_event_name?: string;
  custom_event_type?: string;
  shoot_type?: string;
  event_date: string;
  Event_End_Date?: string;
  event_end_date?: string;
  event_time: string;
  reporting_time?: string;
  Reporting_date?: string;
  event_location: string;
  budget: number;
  sales_person: string;
  sales_staff_id?: string;
  sales_staff_name?: string;
  sales_staff_mobile?: string;
  status: CurrentStage;
  remarks?: string;
  photo_url?: string;
  event_id?: string;
  event_name?: string;
  asset_id?: string;
  proof_type?: string;
  events?: LeadEvent[];
  created_by: string;
  updated_by?: string;
  updated_at?: string;
  assigned_editor?: string;
  assigned_editors?: string;
  production_role?: string;
  delivery_target_date?: string;
  current_status?: string;
  current_stage?: 'Sales' | 'Operations' | 'Production' | 'Completed'
  | 'Project Completed';
  whatsapp_number?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  client_residence_address?: string;
  desired_event_shoot_type?: string;
  Select_Package_Option?: string;
  selected_package_id?: string;
  Specify_Custom_Lead_Source_Name?: string | null;
  package_price?: number;
  Add_Deliverable?: string;
  deliverables_description?: string;
  Team_Members?: string;
  Team_member?: string;
  team_members?: string;
  notes_special_customizations?: string;
  quotation_discount?: number;
  additional_services_cost?: number;
  Additional_Services_Cost?: number | null;
  Quotation_Discount?: number | null;
  Final_Quotation_Amount?: number | null;
  Final_Package_Amount?: number | null;
  total_pax?: number;
  reference_source?: string;
  lead_value?: number;
  follow_up_notes?: string;
  next_follow_up_date?: string;
  Lost_Reason?: string;
  Lost_Notes?: string;
  lost_reason?: string;
  lost_notes?: string;
  lead_score?: number;
  booking_status?: string;
  google_maps_link?: string;
  guest_pax?: number;
  staff_pax?: number;
  booking_date?: string;
  booking_time?: string;
  quotation_locked?: boolean;
  final_package_amount?: number;
  advance_collected?: number;
  payment_mode?: string;
  transaction_id?: string;
  contract_notes?: string;
}

export interface LeadPackage {
  lead_package_id: string;
  lead_id: string;
  package_id: string;
  package_name: string;
  package_cost: number;
  quantity: number;
  total_amount: number;
  discount: number;
  final_amount: number;
  created_at?: string;
  deliverables_description?: string;
  notes_special_customizations?: string;
  additional_services_cost?: number;
  team_members?: string;
  deliverables?: string;
  editable_inclusions?: Record<string, string[]>;
  editable_deliverables?: Record<string, string[]>;
  Team_Members_Included?: any;
  deliverables_descriptionn?: any;
}

export interface Order {
  order_id: string;
  lead_id: string;
  customer_id?: string;
  customer_name: string;
  mobile: string;
  event_type: string;
  custom_event_name?: string;
  custom_event_type?: string;
  shoot_type?: string;
  event_date: string;
  event_time: string;
  reporting_time?: string;
  Reporting_date?: string;
  event_location: string;
  package_name: string;
  quotation_amount: number;
  advance_received: number;
  balance_amount: number;
  order_status: 'Confirmed' | 'Completed'
  | 'Project Completed' | 'Delivered' | 'Paid' | 'Closed';
  current_stage: CurrentStage;
  sales_person: string;
  sales_staff_id?: string;
  sales_staff_name?: string;
  sales_staff_mobile?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
  whatsapp_number?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  client_residence_address?: string;
  desired_event_shoot_type?: string;
  Select_Package_Option?: string;
  Specify_Custom_Lead_Source_Name?: string | null;
  package_price?: number;
  deliverables_description?: string;
  notes_special_customizations?: string;
  quotation_discount?: number;
  additional_services_cost?: number;
  total_pax?: number;
  reference_source?: string;
  lead_value?: number;
  follow_up_notes?: string;
  next_follow_up_date?: string;
  Lost_Reason?: string;
  Lost_Notes?: string;
  lost_reason?: string;
  lost_notes?: string;
  lead_score?: number;
  booking_status?: string;
}

export interface Customer {
  customer_id: string;
  customer_name: string;
  mobile: string;
  alternate_mobile?: string;
  email: string;
  totalOrders: number;
  totalRevenue: number;
  previousPackages: string[];
  previousEvents: string[];
  lastEventDate?: string;
  leads: Lead[];
  orders: Order[];
  payments: Payment[];
}

export interface Operation {
  operation_id: string;
  order_id: string;
  photographer_assigned: string;
  videographer_assigned: string;
  drone_operator_assigned: string;
  assistant_assigned: string;
  equipment_kit: string;
  reporting_time: string;
  event_status: 'Assigned' | 'Completed'
  | 'Project Completed' | 'Event Scheduled' | 'Event Completed' | 'Raw Footage Received' | string;
  remarks?: string;
  updated_by: string;
  Upload_Notes_Remarks?: string;
  upload_notes_remarks?: string;
  Raw_Footage_Drive_Link?: string;
  raw_footage_drive_link?: string;
  Consolidated_Drive_Link?: string;
  consolidated_drive_link?: string;
  event_id?: string;
}

export interface RawFootage {
  tracking_id: string;
  order_id: string;
  event_completed_date: string;
  raw_received: boolean;
  server_path?: string;
  uploaded_by?: string;
  uploaded_date?: string;
  status: 'Pending' | 'Received';
  storage_type?: string;
  upload_notes?: string;
}

export interface Production {
  production_id: string;
  tracking_id: string;
  editor_assigned: string;
  raw_footage_location?: string; // from server_path
  editing_start_date?: string;
  expected_delivery_date?: string;
  editing_status: EditingStatus;
  customer_review_status?: 'Pending Review' | 'Feedback Given' | 'Approved';
  delivery_date?: string;
  remarks?: string;
  project_notes?: string;
  internal_comments?: string;
  assigned_staff?: string;
  project_priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  raw_footage_status?: string;
  target_delivery_date?: string;
  actual_delivery_date?: string;
  production_status?: EditingStatus | 'New Project' | 'Footage Received' | 'Editor Assigned' | 'Editing Started' | 'In Progress' | 'Customer Review' | 'Revision Required' | 'Approved' | 'Delivered' | 'Closed' | 'Project Completed' | 'Project Cancelled' | 'Order Closed' | string;
  current_status?: string;
  approval_status?: string;
  editing_progress?: string;
  delivery_link?: string;
  client_communication_proof?: string;
  event_id?: string;
  custom_event_name?: string;
  event_date?: string;
  event_time?: string;
  server_upload_confirmed?: boolean;
  server_upload_event_date?: string;
  server_upload_folder_name?: string;
  server_path?: string;
  checklist_customer_acceptance?: boolean;
  checklist_content_usage?: boolean;
  checklist_footage_deleted_7_days?: boolean;
  checklist_payment_from_sales?: boolean;
  checklist_edited_files_uploaded?: boolean;
  server_upload_validated?: boolean;
  validated_server_uploads?: Record<string, boolean>;
  checklist_client_communication_proof?: boolean;
  upload_name?: string;
  proof_name?: string;
  client_communication_proof_name?: string;
  delivery_method?: 'server_link' | 'physical_drive';
  server_link?: string;
  physical_drive_details?: string;
}

export interface Payment {
  payment_id: string;
  order_id: string;
  quotation_amount: number;
  advance_received: number;
  balance_due: number;
  final_payment_received: number;
  payment_date?: string;
  payment_proof_url?: string;
  payment_status: PaymentStatus;
  payment_collection_status?: string;
  additional_received?: number;
  transaction_id?: string;
  Payment_type?: string;
  payment_type?: string;
}

export interface CalendarMemo {
  id: string;
  memo_date: string;
  title: string;
  message: string;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityLog {
  log_id: string;
  user_name: string;
  role: UserRole;
  action: string;
  module: string;
  record_id: string;
  timestamp: string;
  previous_stage?: string;
  new_stage?: string;
  date?: string;
  time?: string;
}

export interface Staff {
  staff_id: string;
  name: string;
  mobile: string;
  whatsapp_number?: string;
  email: string;
  role: string;
  department: string;
  status: 'Active' | 'Inactive';
  staff_type?: 'In-House' | 'Freelancer';
  joining_date: string;
  profile_photo?: string;
  notes?: string;
  production_role_speciality?: string;
  experience?: string;
  employee_id?: string;
  city?: string;
  Skill?: string[];
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
  auth_user_id?: string;
  password?: string;
}

export interface ProductionSpeciality {
  speciality_id: string;
  name: string;
  active: boolean;
  created_at?: string;
}

export interface EditorAssignment {
  assignment_id: string;
  production_id: string;
  staff_id: string;
  staff_name: string;
  speciality: string;
  assigned_date: string;
  target_finish_date: string;
  status: 'Assigned' | 'Editing Started' | 'Customer Review' | 'Client Review' | 'Editing Complete' | 'Editing Completed' | 'In Progress' | 'Review Pending' | 'Revision' | 'Completed' | 'Project Completed';
  created_at?: string;
  Edited_Drive_Link?: string;
  edited_drive_link?: string;
  order_id?: string;
  event_id?: string;
  deliverable_id?: string;
  customer_communication_proof?: string;
  client_communication_proof?: string;
  confirmation_proof?: string;
  customer_review_image?: string;
  customer_proof?: string;
  client_proof?: string;
  proof_url?: string;
  proof_image?: string;
  uploaded_proof?: string;
  remarks?: string;
  notes?: string;
  server_upload_confirmed?: boolean;
  server_upload_event_date?: string;
  server_upload_folder_name?: string;
  server_upload_confirmed_at?: string;
  server_upload_confirmed_by?: string;
  edited_folder_uploaded_to_server?: boolean;
  server_upload_validated?: boolean;
  server_upload_validated_at?: string;
  server_upload_validated_by?: string;
  server_file_link?: string;
  upload_link?: string;
  folder_name?: string;
  upload_link_path?: string;
}

export interface ClientAcceptanceVerification {
  id?: string;
  order_id: string;
  event_id: string;
  task_id?: string;
  assignment_id?: string;
  client_communication_consent_proof?: string;
  folder_name?: string;
  upload_link_path?: string;
  final_edited_footage_link?: string;
  proof_file_name?: string;
  proof_storage_path?: string;
  consent_proof_verified?: boolean;
  delivery_method?: 'server_link' | 'physical_drive';
  server_link?: string;
  physical_drive_details?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskAssignmentDetail {
  order_id: string;
  event_id: string | null;
  event_name: string | null;
  assignment_id: string;
  staff_id: string | null;
  staff_name: string;
  staff_role: string;
  task_status: string | null;
  raw_footage_link: string | null;
  event_start_photo: string | null;
  event_end_photo: string | null;
  equipment_received_photo: string | null;
  equipment_handover_photo: string | null;
}

export interface StaffAssignment {
  assignment_id: string;
  order_id: string;
  lead_id?: string;
  staff_role: string;
  staff_id: string;
  staff_name: string;
  assignment_date: string;
  assignment_status: 'Assigned' | 'Completed' | 'Event Started' | 'Event Completed'
  | 'Project Completed' | 'Cancelled' | string;
  whatsapp_sent_status?: string;
  task_status?: string;
  updated_by?: string;
  updated_at?: string;
  event_id?: string;
  event_name?: string;
  event_date?: string;
  reporting_time?: string;
  equipment?: string[];
  assigned_equipment?: string[];
  equipment_details?: any[];
  mobile?: string;
  staff_type?: string;
  raw_footage_link?: string;
  equipment_received_photo?: string;
  event_start_photo?: string;
  event_start_time?: string;
  event_end_photo?: string;
  event_end_time?: string;
  equipment_handover_photo?: string;
  equipment_handover_notes?: string;
  equipment_handover_to?: string;
  proofs?: any;
  notes?: string;
  remarks?: string;
}

export interface StaffTaskSubmission {
  id?: string;
  assignment_id?: string;
  order_id: string;
  lead_id?: string;
  event_id?: string;
  event_name?: string;
  staff_id?: string;
  staff_name: string;
  staff_role?: string;
  submission_type: 'equipment_received' | 'event_start' | 'event_complete' | 'equipment_handover' | 'raw_footage';
  task_status?: string;
  photo_url?: string;
  proof_photos?: any;
  raw_footage_link?: string;
  handover_to?: string;
  handover_notes?: string;
  equipment_name?: string;
  asset_id?: string;
  remarks?: string;
  created_at?: string;
}

export interface LeadStaffAssignmentHistory {
  id?: string;
  lead_id: string;
  order_id?: string;
  assigned_role: string;
  assigned_staff: string;
  assigned_by?: string;
  assigned_at: string;
}

export interface UnlockRequest {
  lead_id: string;
  order_id: string;
  customer_name: string;
  sales_staff_id: string;
  sales_staff_name: string;
  sales_staff_mobile: string;
  reason: string;
  custom_reason?: string | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_at: string;
  created_at: string;
}

export interface Notification {
  notification_id: string;
  user_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  notification_type: string;
  title: string;
  message: string;
  read_status: boolean;
  created_at?: string;
  is_read?: boolean;
  read?: boolean;
  recipient_role?: string;
  priority?: string | null;
  recipient_user_id?: string | null;
  recipient_email?: string | null;
  sender_user_id?: string | null;
  sender_name?: string | null;
  related_table?: string | null;
  related_record_id?: string | null;
  action_url?: string | null;
  is_archived?: boolean;
  read_at?: string | null;
  expires_at?: string | null;
}

export interface Equipment {
  equipment_id: string;
  id?: string;
  name?: string;
  category?: string;
  equipment_name: string;
  equipment_type: string;
  brand: string;
  model: string;
  serial_number: string;
  quantity: number;
  available_quantity: number;
  status: 'Available' | 'Assigned' | 'Maintenance' | 'Damaged' | 'Lost' | 'Retired' | string;
  current_holder_name?: string;
  current_order_id?: string;
  condition?: string;
  purchase_date: string;
  purchase_price?: number;
  storage_location?: string;
  notes?: string;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Package {
  package_id: string;
  package_name: string;
  category: string;
  price: number;
  status: 'Active' | 'Inactive';
  deliverables?: string;
  team_members?: string;
  seasonal_offer?: string;
  terms_conditions?: string;
  event_type?: string;
  duration?: string;
  package_includes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EquipmentHandover {
  handover_id: string;
  order_id: string;
  equipment_name: string;
  return_status: 'Returned' | 'Not Returned' | 'Damaged' | 'Missing';
  return_date: string;
  returned_by: string;
  notes: string;
  created_at?: string;
}

export interface LeadEquipmentHistory {
  id?: string;
  lead_id: string;
  order_id?: string;
  assignment_id?: string;
  equipment_name: string;
  equipment_serial?: string;
  equipment_status: string;
  assigned_to_name?: string;
  assigned_to_id?: string;
  assigned_at?: string;
  returned_by?: string;
  returned_at?: string;
  condition_on_return?: string;
  photo_url?: string;
  asset_id?: string;
  event_id?: string;
  event_name?: string;
  proof_type?: string;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UnlockOverride {
  recordId: string;
  unlockedBy: string;
  unlockDate: string;
  reason: string;
  module: 'Sales' | 'Operations' | 'Production';
}

export interface CustomRole {
  id: string;
  role_name: string;
  description?: string | null;
  status: 'Active' | 'Inactive';
  created_at?: string;
  updated_at?: string;
}

export interface CustomDeliverable {
  id: string;
  deliverable_name: string;
  description?: string | null;
  status: 'Active' | 'Inactive';
  created_at?: string;
  updated_at?: string;
}




