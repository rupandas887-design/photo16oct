import { User, Lead, Order, Operation, RawFootage, Production, Payment, ActivityLog, Equipment } from './types';

export const INITIAL_USERS: User[] = [
  {
    id: 'U-001',
    name: 'Business Owner',
    mobile: '+1 (555) 019-2834',
    email: 'Owner@photocrew.com',
    role: 'Business Owner',
    active: true,
    created_at: '2026-05-01T08:00:00Z',
    password: 'owner@123'
  },
  {
    id: 'U-002',
    name: 'Sales',
    mobile: '+1 (555) 014-9988',
    email: 'Sale@photocrew.com',
    role: 'Sales Team',
    active: true,
    created_at: '2026-05-02T09:30:00Z',
    password: 'sales@123'
  },
  {
    id: 'U-003',
    name: 'Operations',
    mobile: '+1 (555) 016-5544',
    email: 'Operation@photocrew.com',
    role: 'Operations Team',
    active: true,
    created_at: '2026-05-03T10:15:00Z',
    password: 'ops@123'
  },
  {
    id: 'U-004',
    name: 'Production',
    mobile: '+1 (555) 012-3322',
    email: 'Production@photocrew.com',
    role: 'Production Team',
    active: true,
    created_at: '2026-05-04T11:00:00Z',
    password: 'prod@123'
  }
];

export const INITIAL_LEADS: Lead[] = [
  {
    lead_id: 'LD-9001',
    created_date: '2026-06-10',
    lead_source: 'Instagram',
    customer_name: 'Sophia Loren',
    mobile: '+1 (555) 123-4567',
    email: 'sophia@example.com',
    event_type: 'Weddings',
    event_date: '2026-08-15',
    event_time: '14:00',
    event_location: 'Grand Hyatt Beach Lawn',
    budget: 79999,
    sales_person: 'Sarah Jenkins',
    status: 'New Lead',
    remarks: 'Inquired via Instagram DM. Wants Wedding - Bronze package.',
    created_by: 'Sarah Jenkins',
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    order_id: 'ORD-1005',
    lead_id: 'LD-9001',
    customer_name: 'Sophia Loren',
    mobile: '+1 (555) 123-4567',
    event_type: 'Weddings',
    event_date: '2026-08-15',
    event_time: '14:00',
    event_location: 'Grand Hyatt Beach Lawn',
    package_name: 'Wedding - Bronze',
    quotation_amount: 79999,
    advance_received: 40000,
    balance_amount: 39999,
    order_status: 'Confirmed',
    current_stage: 'Order Confirmed',
    sales_person: 'Sarah Jenkins',
    created_at: '2026-06-01T10:00:00Z',
  }
];

export const INITIAL_OPERATIONS: Operation[] = [
  {
    operation_id: 'OP-5006',
    order_id: 'ORD-1005',
    photographer_assigned: 'Jack Richards',
    videographer_assigned: 'Tina Fey',
    drone_operator_assigned: 'None',
    assistant_assigned: 'Steve Rogers',
    equipment_kit: 'Standard Wedding Kit',
    reporting_time: '12:00',
    event_status: 'Assigned',
    remarks: 'First shoot for new demo package.',
    updated_by: 'Robert O\'Connor',
  }
];

export const INITIAL_RAW_FOOTAGE: RawFootage[] = [];
export const INITIAL_PRODUCTION: Production[] = [];
export const INITIAL_PAYMENTS: Payment[] = [];
export const INITIAL_LOGS: ActivityLog[] = [];
export const INITIAL_EQUIPMENT: Equipment[] = [
  {
    equipment_id: 'EQ-001',
    equipment_name: 'Sony FX3 Full Cinema Body',
    equipment_type: 'Camera',
    brand: 'Sony',
    model: 'ILME-FX3',
    serial_number: 'SN-FX3-882109',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-01-10',
    purchase_price: 3900,
    storage_location: 'Vault Bay A1',
    notes: 'Primary full-frame cinema body.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-002',
    equipment_name: 'Sony A7 IV Mirrorless Body',
    equipment_type: 'Camera',
    brand: 'Sony',
    model: 'ILCE-7M4',
    serial_number: 'SN-A74-774102',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-01-15',
    purchase_price: 2500,
    storage_location: 'Vault Bay A2',
    notes: 'Secondary photo/video body.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-003',
    equipment_name: 'Sony FE 24-70mm f/2.8 GM II',
    equipment_type: 'Lens',
    brand: 'Sony',
    model: 'SEL2470GM2',
    serial_number: 'SN-SNY-289410',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-01-10',
    purchase_price: 2200,
    storage_location: 'Main Shelf L1',
    notes: 'Standard zoom lens.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-004',
    equipment_name: 'Sony FE 70-200mm f/2.8 GM OSS II',
    equipment_type: 'Lens',
    brand: 'Sony',
    model: 'SEL70200GM2',
    serial_number: 'SN-SNY-449102',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-02-01',
    purchase_price: 2800,
    storage_location: 'Main Shelf L2',
    notes: 'Telephoto zoom lens.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-005',
    equipment_name: 'DJI Mavic 3 Pro Cine Drone',
    equipment_type: 'Drone',
    brand: 'DJI',
    model: 'Mavic 3 Pro',
    serial_number: 'SN-DJI-661092',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-02-10',
    purchase_price: 3200,
    storage_location: 'Hangar Case D1',
    notes: 'Tri-camera drone with ProRes support.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-006',
    equipment_name: 'DJI RS 3 Pro Gimbal Stabilizer',
    equipment_type: 'Gimbal',
    brand: 'DJI',
    model: 'RS 3 Pro Combo',
    serial_number: 'SN-RS3-110294',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-02-15',
    purchase_price: 900,
    storage_location: 'Gimbal Shelf G1',
    notes: 'Professional 3-axis gimbal.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-007',
    equipment_name: 'Aputure LS 300d II Light Kit',
    equipment_type: 'Lighting',
    brand: 'Aputure',
    model: 'LS 300d II',
    serial_number: 'SN-APT-300912',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-01-20',
    purchase_price: 1100,
    storage_location: 'Lighting Rig Shelf',
    notes: 'Daylight LED with Light Dome softbox.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-008',
    equipment_name: 'Godox AD600 Pro TTL Flash',
    equipment_type: 'Lighting',
    brand: 'Godox',
    model: 'AD600Pro',
    serial_number: 'SN-GDX-600129',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-01-22',
    purchase_price: 850,
    storage_location: 'Lighting Rig Shelf',
    notes: 'High-power outdoor battery strobe.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-009',
    equipment_name: 'Rode Wireless PRO Dual Mic Kit',
    equipment_type: 'Audio',
    brand: 'Rode',
    model: 'Wireless PRO',
    serial_number: 'SN-RDE-883192',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-02-05',
    purchase_price: 400,
    storage_location: 'Audio Case M1',
    notes: '32-bit float wireless dual lapel microphones.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-010',
    equipment_name: 'Manfrotto 504X Video Fluid Tripod',
    equipment_type: 'Tripod',
    brand: 'Manfrotto',
    model: '504X FAST Alu',
    serial_number: 'SN-MNF-504108',
    quantity: 1,
    available_quantity: 1,
    status: 'Available',
    purchase_date: '2025-01-18',
    purchase_price: 750,
    storage_location: 'Tripod Bay T1',
    notes: 'Heavy-duty fluid head video tripod.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-011',
    equipment_name: 'Sony Tough 160GB CFexpress Type A',
    equipment_type: 'Memory Card',
    brand: 'Sony',
    model: 'CEA-G160T',
    serial_number: 'SN-CFX-160102',
    quantity: 2,
    available_quantity: 2,
    status: 'Available',
    purchase_date: '2025-01-12',
    purchase_price: 350,
    storage_location: 'Card Safe CS1',
    notes: 'High-speed cinema capture cards.',
    created_at: new Date().toISOString()
  },
  {
    equipment_id: 'EQ-012',
    equipment_name: 'SmallRig VB99 Pro Mini V-Mount Battery',
    equipment_type: 'Battery',
    brand: 'SmallRig',
    model: 'VB99 Pro',
    serial_number: 'SN-BAT-990184',
    quantity: 2,
    available_quantity: 2,
    status: 'Available',
    purchase_date: '2025-01-25',
    purchase_price: 280,
    storage_location: 'Power Station P1',
    notes: 'Compact 99Wh 14.8V V-Mount battery.',
    created_at: new Date().toISOString()
  }
];

