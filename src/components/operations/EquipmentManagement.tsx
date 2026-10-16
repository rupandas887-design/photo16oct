import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from '../RoleContext';
import { 
  Camera, Package, PlusCircle, Wrench, Edit3, Calendar, 
  ClipboardList, Search, Filter, X, ChevronLeft, ChevronRight, 
  Eye, CheckCircle2, AlertTriangle, Info, User, HelpCircle, MapPin, Tag, Download
} from 'lucide-react';
import { Equipment } from '../../types';
import { supabaseClient } from '../../supabaseClient';

import { formatTime12Hour, formatDateDDMMYY, getStoredEquipmentCategories, saveEquipmentCategoryToStorage, scrollToFirstError } from "../../utils";

const toCalendarDateString = (dateVal?: string | null | Date): string | null => {
  if (!dateVal && (dateVal as any) !== 0) return null;
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  let str = String(dateVal).trim();
  if (!str || str === '—' || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return null;

  // Clean day of week prefixes and ordinal numbers (e.g. "Wed, 30th Sep 2026" -> "30 Sep 2026")
  str = str.replace(/^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,]+/i, '');
  str = str.replace(/(\d+)(?:st|nd|rd|th)/gi, '$1');

  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const n1 = parseInt(dmyMatch[1], 10);
    const n2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    if (n2 > 12 && n1 <= 12) {
      return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
    }
    return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
  }

  const dmyShortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    let y = parseInt(dmyShortMatch[3], 10);
    y = y < 100 ? 2000 + y : y;
    return `${y}-${dmyShortMatch[2].padStart(2, '0')}-${dmyShortMatch[1].padStart(2, '0')}`;
  }

  const dMmmYMatch = str.match(/^(\d{1,2})[\s\-\/\.]*([a-zA-Z]{3,9})[\s\-\/\.,]*(\d{2,4})/);
  if (dMmmYMatch) {
    const d = dMmmYMatch[1].padStart(2, '0');
    const mStr = dMmmYMatch[2].toLowerCase().slice(0, 3);
    const mIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mStr);
    if (mIdx !== -1) {
      const m = String(mIdx + 1).padStart(2, '0');
      let y = parseInt(dMmmYMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}-${d}`;
    }
  }

  const mmmDYMatch = str.match(/^([a-zA-Z]{3,9})[\s\-\/\.]*(\d{1,2})[\s\-\/\.,]*(\d{2,4})/);
  if (mmmDYMatch) {
    const mStr = mmmDYMatch[1].toLowerCase().slice(0, 3);
    const mIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mStr);
    if (mIdx !== -1) {
      const m = String(mIdx + 1).padStart(2, '0');
      const d = mmmDYMatch[2].padStart(2, '0');
      let y = parseInt(mmmDYMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}-${d}`;
    }
  }

  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, '0');
    const d = String(fallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
};

const getTodayDateString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Helper to accurately extract or infer category from equipment
const getEquipmentCategory = (eq: any): string => {
  if (!eq) return 'Other';
  const raw = eq.equipment_type || eq.category || eq.Equipment_Category || eq.equipment_category;
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === 'audio equipment') return 'Audio';
    if (trimmed.toLowerCase() === 'memory cards' || trimmed.toLowerCase() === 'memory card') return 'Memory Card';
    if (trimmed.toLowerCase() === 'batteries' || trimmed.toLowerCase() === 'battery') return 'Battery';
    if (trimmed.toLowerCase() === 'light' || trimmed.toLowerCase() === 'lights') return 'Lighting';
    return trimmed;
  }
  const name = (eq.equipment_name || eq.name || '').toLowerCase();
  if (name.includes('camera') || name.includes('fx3') || name.includes('a7') || name.includes('eos') || name.includes('cinema body') || name.includes('red') || name.includes('lumix')) return 'Camera';
  if (name.includes('lens') || name.includes('mm') || name.includes('f/') || name.includes('prime') || name.includes('zoom')) return 'Lens';
  if (name.includes('light') || name.includes('godox') || name.includes('aputure') || name.includes('softbox') || name.includes('flash')) return 'Lighting';
  if (name.includes('audio') || name.includes('mic') || name.includes('rode') || name.includes('dji mic') || name.includes('receiver') || name.includes('transmitter')) return 'Audio';
  if (name.includes('tripod') || name.includes('monopod') || name.includes('stand')) return 'Tripod';
  if (name.includes('gimbal') || name.includes('ronin') || name.includes('stabilizer') || name.includes('rs3') || name.includes('rs2')) return 'Gimbal';
  if (name.includes('card') || name.includes('sd ') || name.includes('cfexpress') || name.includes('memory')) return 'Memory Card';
  if (name.includes('battery') || name.includes('batteries') || name.includes('v-mount') || name.includes('power')) return 'Battery';
  if (name.includes('drone') || name.includes('mavic') || name.includes('mini 4') || name.includes('inspire')) return 'Drone';
  return 'Other';
};

// Helper to parse equipment notes containing structured metadata
interface EquipmentMetadata {
  condition: string;
  assignedStaff: string;
  notes: string;
}

export interface ActiveEquipmentTask {
  id: string;
  orderId: string;
  leadId?: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  assignedStaff: string;
  taskStatus: string;
  source: string;
}

const parseEquipmentNotes = (rawNotes: string | undefined): EquipmentMetadata => {
  if (!rawNotes) {
    return { condition: 'Excellent', assignedStaff: '', notes: '' };
  }
  
  if (rawNotes.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawNotes);
      return {
        condition: parsed.condition || 'Excellent',
        assignedStaff: parsed.assignedStaff || '',
        notes: parsed.notes || ''
      };
    } catch (e) {
      // Fallback if JSON parsing fails
    }
  }

  // Fallback for simple plain text notes
  return {
    condition: 'Excellent',
    assignedStaff: '',
    notes: rawNotes
  };
};

const serializeEquipmentNotes = (metadata: EquipmentMetadata): string => {
  return JSON.stringify({
    condition: metadata.condition,
    assignedStaff: metadata.assignedStaff,
    notes: metadata.notes
  });
};

export const EquipmentManagement: React.FC = () => {
  const { 
    currentRole, 
    currentUserName, 
    equipment, 
    staff, 
    addEquipment, 
    updateEquipment, 
    deleteEquipment, 
    refreshData,
    leadEquipmentHistory,
    equipmentHandovers,
    staffAssignments,
    operations,
    orders,
    leads
  } = useRole();
  const canEdit = currentRole === 'Operations Team' || currentRole === 'Business Owner';

  // Core management states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEq, setSelectedEq] = useState<Equipment | null>(null);
  const [busyEquipment, setBusyEquipment] = useState<{ equipment: Equipment; tasks: ActiveEquipmentTask[] } | null>(null);
  
  // Search, filter, and sort states
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [selectedCategoryView, setSelectedCategoryView] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    type: 'All',
    status: 'All',
    brand: 'All',
    condition: 'All'
  });
  const [sortBy, setSortBy] = useState<string>('name-asc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Custom Toast notifications state to avoid browser alerts
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Category management states
  const [customCategories, setCustomCategories] = useState<string[]>(() => getStoredEquipmentCategories());
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryError, setNewCategoryError] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  useEffect(() => {
    const handleCategoryUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setCustomCategories(e.detail);
      } else {
        setCustomCategories(getStoredEquipmentCategories());
      }
    };
    window.addEventListener('equipment-categories-updated', handleCategoryUpdate);
    return () => {
      window.removeEventListener('equipment-categories-updated', handleCategoryUpdate);
    };
  }, []);

  // Form states
  const [showGearForm, setShowGearForm] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [form, setForm] = useState({
    equipment_name: '',
    brand: '',
    equipment_type: 'Camera',
    status: 'Active' as string
  });

  // Automatically bring error messages into view when validation fails
  useEffect(() => {
    if (formErrors.length > 0) {
      scrollToFirstError();
    }
  }, [formErrors]);

  useEffect(() => {
    if (showGearForm || selectedEq || busyEquipment || showAddCategoryModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showGearForm, selectedEq, busyEquipment, showAddCategoryModal]);

  // Handle selecting an item for editing
  const handleSelectEdit = (eq: Equipment, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(eq.equipment_id);
    const mappedStatus = ['Active', 'Available', 'Assigned', 'In Use'].includes(eq.status) ? 'Active' : 'Inactive';
    setForm({
      equipment_name: eq.equipment_name,
      brand: eq.brand || '',
      equipment_type: eq.equipment_type || 'Camera',
      status: mappedStatus
    });
    setShowGearForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setShowGearForm(false);
    setForm({
      equipment_name: '',
      brand: '',
      equipment_type: 'Camera',
      status: 'Active'
    });
  };

  // Automatically scroll to the form when editing starts (no longer needed since it's a modal, but keeping structure safe)
  useEffect(() => {
    if (editingId && showGearForm) {
      const formEl = document.getElementById('equipment_registry_form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [editingId, showGearForm]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      showToast('error', 'Unauthorized! Operations Team or Business Owner privileges required.');
      return;
    }

    const errors: string[] = [];
    if (!form.equipment_name) errors.push('equipment_name');
    if (!form.brand) errors.push('brand');
    if (!form.equipment_type) errors.push('equipment_type');
    if (!form.status) errors.push('status');

    setFormErrors(errors);

    if (errors.length > 0) {
      setTimeout(() => {
        const firstErrorEl = document.querySelector('.border-rose-500');
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
      return;
    }

    // Check for duplicate equipment
    const isDuplicate = equipment.some(eq => 
      eq.equipment_name.toLowerCase() === form.equipment_name.toLowerCase() && 
      eq.brand.toLowerCase() === form.brand.toLowerCase() &&
      eq.equipment_id !== editingId
    );

    if (isDuplicate) {
      showToast('error', 'Equipment with this name and brand already exists.');
      return;
    }

    try {
      if (editingId) {
        // Editing: Only allow updating the 4 fields!
        const payload = {
          equipment_name: form.equipment_name,
          brand: form.brand,
          equipment_type: form.equipment_type,
          status: form.status,
        };
        await updateEquipment(editingId, payload);
        showToast('success', 'Equipment details updated successfully.');
        handleCancelEdit();
      } else {
        // Registering new
        const now = new Date().toISOString();
        const { error } = await supabaseClient.from('equipment').insert([
          {
            equipment_name: form.equipment_name,
            brand: form.brand,
            Equipment_Category: form.equipment_type,
            Equipment_Status: form.status,
            equipment_type: form.equipment_type,
            status: form.status,
            model: '',
            serial_number: null,
            quantity: 1,
            available_quantity: 1,
            purchase_date: null,
            purchase_price: null,
            storage_location: null,
            notes: null,
            created_by: currentUserName || 'Operations Team',
            updated_by: currentUserName || 'Operations Team',
            created_at: now,
            updated_at: now
          }
        ]);

        if (error) {
          console.error('Failed to add equipment:', error);
          showToast('error', '❌ Failed to add equipment.');
          return;
        }

        showToast('success', '✅ Equipment added successfully.');
        refreshData();
        handleCancelEdit();
      }
    } catch (err: any) {
      showToast('error', err.message || 'An error occurred while saving equipment.');
    }
  };

  // Get active distinct lists for filters
  const uniqueBrands = useMemo(() => {
    return Array.from(new Set(equipment.map(e => e.brand).filter(Boolean)));
  }, [equipment]);

  const allEquipmentCategories = useMemo(() => {
    const defaults = ['Camera', 'Lens', 'Drone', 'Gimbal', 'Tripod', 'Light', 'Audio Equipment', 'Memory Cards', 'Batteries', 'Other'];
    const fromEq = equipment.map(e => getEquipmentCategory(e)).filter(Boolean);
    return Array.from(new Set([...defaults, ...fromEq, ...customCategories])).filter(Boolean);
  }, [equipment, customCategories]);

  const uniqueCategories = useMemo(() => {
    const fromEq = equipment.map(e => getEquipmentCategory(e)).filter(Boolean);
    const defaults = ['Camera', 'Lens', 'Drone', 'Gimbal', 'Tripod', 'Lighting', 'Light', 'Audio', 'Audio Equipment', 'Memory Cards', 'Batteries', 'Other'];
    return Array.from(new Set([...fromEq, ...defaults, ...customCategories])).filter(Boolean).sort();
  }, [equipment, customCategories]);

  const handleSaveNewCategory = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setNewCategoryError('Category Name is required.');
      return;
    }

    const alreadyExists = allEquipmentCategories.some(
      c => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (alreadyExists) {
      setNewCategoryError(`Category "${trimmed}" already exists.`);
      return;
    }

    setIsSavingCategory(true);
    try {
      const updated = saveEquipmentCategoryToStorage(trimmed);
      setCustomCategories(updated);
      setForm(prev => ({
        ...prev,
        equipment_type: trimmed
      }));
      showToast('success', `Equipment category "${trimmed}" added successfully.`);
      setNewCategoryName('');
      setNewCategoryError('');
      setShowAddCategoryModal(false);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Helper to parse equipment from various data sources (array, comma-separated, JSON, or mobiles string)
  const parseEquipmentList = (raw: any): string[] => {
    if (!raw) return [];
    const list: string[] = [];
    if (Array.isArray(raw)) {
      raw.forEach(item => {
        if (typeof item === 'string' && item.trim()) list.push(item.trim());
        else if (item && typeof item === 'object' && (item.equipment_name || item.name)) {
          list.push(String(item.equipment_name || item.name).trim());
        }
      });
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'none' || trimmed === 'null' || trimmed === 'undefined') return [];
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            parsed.forEach(item => {
              if (typeof item === 'string' && item.trim()) list.push(item.trim());
              else if (item && typeof item === 'object' && (item.equipment_name || item.name)) {
                list.push(String(item.equipment_name || item.name).trim());
              }
            });
          } else if (typeof parsed === 'string' && parsed.trim()) {
            list.push(parsed.trim());
          }
        } catch {
          trimmed.split(',').forEach(s => { if (s.trim()) list.push(s.trim()); });
        }
      } else {
        trimmed.split(',').forEach(s => { if (s.trim()) list.push(s.trim()); });
      }
    }
    return list.filter(item => {
      const l = item.toLowerCase();
      return l !== 'none' && l !== 'null' && l !== 'undefined' && l !== 'not assigned' && l !== '—' && l !== '-';
    });
  };

  // Helper to extract equipment encoded in assigned_staff_mobiles (e.g. from Assign Staff modal)
  const extractEquipmentFromStaffMobiles = (mobilesRaw?: string): string[] => {
    if (!mobilesRaw || typeof mobilesRaw !== 'string') return [];
    const list: string[] = [];
    if (mobilesRaw.includes(' || EQUIPMENT: JSON:')) {
      try {
        const parts = mobilesRaw.split(' || EQUIPMENT: JSON:');
        const parsed = JSON.parse(parts[1]);
        if (Array.isArray(parsed)) {
          parsed.forEach((slot: any) => {
            if (Array.isArray(slot)) {
              slot.forEach((eq: any) => { if (typeof eq === 'string' && eq.trim()) list.push(eq.trim()); });
            } else if (typeof slot === 'string' && slot.trim()) {
              list.push(slot.trim());
            }
          });
        }
      } catch (_) {}
    } else if (mobilesRaw.includes(' || EQUIPMENT: ')) {
      const parts = mobilesRaw.split(' || EQUIPMENT: ');
      if (parts[1]) {
        parts[1].split(',').forEach((s: string) => { if (s.trim()) list.push(s.trim()); });
      }
    }
    return list.filter(item => {
      const l = item.toLowerCase();
      return l !== 'none' && l !== 'null' && l !== 'undefined' && l !== 'not assigned' && l !== '—' && l !== '-';
    });
  };

  // Helper to infer brand from equipment name
  const inferBrand = (name: string): string => {
    const l = name.toLowerCase();
    if (l.includes('sony')) return 'Sony';
    if (l.includes('canon')) return 'Canon';
    if (l.includes('nikon')) return 'Nikon';
    if (l.includes('fujifilm') || l.includes('fuji')) return 'Fujifilm';
    if (l.includes('panasonic') || l.includes('lumix')) return 'Panasonic';
    if (l.includes('dji')) return 'DJI';
    if (l.includes('godox')) return 'Godox';
    if (l.includes('aputure') || l.includes('amaran')) return 'Aputure';
    if (l.includes('rode')) return 'Rode';
    if (l.includes('sennheiser')) return 'Sennheiser';
    if (l.includes('blackmagic')) return 'Blackmagic';
    if (l.includes('sandisk')) return 'SanDisk';
    if (l.includes('manfrotto')) return 'Manfrotto';
    return 'Studio Gear';
  };

  // Helper to test if an event date matches the target calendar date
  const isDateMatch = (dateVal: any, targetCalDate: string, endDateVal?: any): boolean => {
    if (!dateVal || !targetCalDate) return false;
    const calDate = toCalendarDateString(dateVal);
    if (calDate === targetCalDate) return true;
    if (endDateVal) {
      const endCal = toCalendarDateString(endDateVal);
      if (calDate && endCal && targetCalDate >= calDate && targetCalDate <= endCal) return true;
    }
    const str = String(dateVal);
    if (str.includes(' - ') || str.includes(' to ') || str.includes('–')) {
      const parts = str.split(/\s*[-–]|to\s*/);
      if (parts.length >= 2) {
        const d1 = toCalendarDateString(parts[0]);
        const d2 = toCalendarDateString(parts[1]);
        if (d1 && d2 && targetCalDate >= d1 && targetCalDate <= d2) return true;
      }
    }
    return false;
  };

  // 1. Process all equipment with dynamic active tasks and status calculated for selectedDate
  const allEquipmentWithStatus = useMemo(() => {
    const targetCalendarDate = toCalendarDateString(selectedDate) || selectedDate;
    const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const completedStages = [
      'cancelled', 'canceled', 'completed', 'event completed', 'event ended',
      'project completed', 'closed', 'order closed', 'project closed', 'delivered', 'project delivered',
      'footage handover', 'equipment handover completed', 'returned', 'lost lead', 'lost', 'rejected'
    ];

    // Helper to check if equipment was returned for an order / lead
    const isReturnedForOrder = (ordId?: string, ldId?: string, eqNameToCheck?: string): boolean => {
      if (!ordId && !ldId) return false;
      const normCheck = eqNameToCheck ? normalize(eqNameToCheck) : '';
      
      const hasHistoryReturn = (leadEquipmentHistory || []).some(h => {
        const orderMatch = (ordId && h.order_id === ordId) || (ldId && h.lead_id === ldId);
        if (!orderMatch) return false;
        const nameMatch = !normCheck || normalize(h.equipment_name).includes(normCheck) || normCheck.includes(normalize(h.equipment_name));
        const isRet = h.equipment_status === 'Equipment Handover Completed' || 
                      h.equipment_status === 'Returned' || 
                      Boolean(h.returned_at);
        return nameMatch && isRet;
      });
      if (hasHistoryReturn) return true;

      const hasHandoverReturn = (equipmentHandovers || []).some(eh => {
        const orderMatch = (ordId && eh.order_id === ordId) || (ldId && eh.order_id === ldId);
        if (!orderMatch) return false;
        const nameMatch = !normCheck || normalize(eh.equipment_name).includes(normCheck) || normCheck.includes(normalize(eh.equipment_name));
        return eh.return_status === 'Returned' && nameMatch;
      });
      if (hasHandoverReturn) return true;

      const matchingOp = (operations || []).find(o => (ordId && o.order_id === ordId) || (ldId && o.order_id === ldId));
      if (matchingOp && ['equipment handover completed', 'returned', 'equipment returned'].includes((matchingOp.equipment_status || '').toLowerCase())) {
        return true;
      }
      return false;
    };

    // STEP 1: Find ALL events on the selected date and extract their assigned equipment
    interface AssignedGearRecord {
      equipmentName: string;
      eventName: string;
      eventDate: string;
      eventTime: string;
      assignedStaff: string;
      orderId: string;
      leadId?: string;
      taskStatus: string;
      source: string;
      taskId: string;
    }

    const assignedGearList: AssignedGearRecord[] = [];
    const seenAssignedKeys = new Set<string>();

    const recordAssignedGear = (gear: AssignedGearRecord) => {
      const key = `${gear.orderId}_${gear.eventName}_${gear.equipmentName}_${gear.assignedStaff}`.toLowerCase();
      if (seenAssignedKeys.has(key)) return;
      seenAssignedKeys.add(key);
      assignedGearList.push(gear);
    };

    // 1A. Scan staffAssignments
    (staffAssignments || []).forEach(sa => {
      const assignStatus = (sa.assignment_status || '').toLowerCase();
      const taskStatus = ((sa as any).task_status || '').toLowerCase();
      if (completedStages.includes(assignStatus) || completedStages.includes(taskStatus)) return;

      const relatedOrder = orders?.find(o => o.order_id === sa.order_id || o.lead_id === sa.order_id);
      const relatedLead = leads?.find(l => l.lead_id === (relatedOrder?.lead_id || sa.order_id) || l.lead_id === (sa as any).lead_id || l.order_id === sa.order_id);

      if (relatedOrder && completedStages.includes((relatedOrder.current_stage || '').toLowerCase())) return;
      if (relatedLead && completedStages.includes((relatedLead.status || relatedLead.current_status || '').toLowerCase())) return;

      const op = operations?.find(o => o.order_id === (sa.order_id || relatedOrder?.order_id));
      if (op && completedStages.includes((op.event_status || '').toLowerCase())) return;

      // Extract events from related containers to check event date
      const containerEvents: any[] = [];
      const pushContainerEvents = (container: any) => {
        if (!container?.events) return;
        let evs = container.events;
        if (typeof evs === 'string') {
          try { evs = JSON.parse(evs); } catch (_) {}
        }
        if (Array.isArray(evs)) {
          evs.forEach(e => { if (e && typeof e === 'object') containerEvents.push(e); });
        }
      };
      pushContainerEvents(relatedLead);
      pushContainerEvents(relatedOrder);

      const matchedEv = containerEvents.find(e => 
        (sa.event_id && (String(e.id) === String(sa.event_id) || String(e.event_id) === String(sa.event_id))) ||
        (sa.event_name && (e.event_name || '').trim().toLowerCase() === (sa.event_name || '').trim().toLowerCase())
      ) || (containerEvents.length === 1 ? containerEvents[0] : null);

      const resolvedEventDate = matchedEv?.event_date || matchedEv?.Reporting_date || matchedEv?.reporting_date || 
                                sa.assignment_date || sa.event_date || (sa as any).Reporting_date || (sa as any).reporting_date || 
                                relatedOrder?.event_date || relatedLead?.event_date;

      const isDateMatched = isDateMatch(resolvedEventDate, targetCalendarDate, matchedEv?.Event_End_Date || matchedEv?.event_end_date);
      if (!isDateMatched) return;

      // Collect equipment items for this assignment
      const eqItems = [
        ...parseEquipmentList(sa.equipment),
        ...parseEquipmentList(sa.assigned_equipment),
        ...parseEquipmentList((sa as any).equipment_details)
      ];

      const resolvedEventName = matchedEv?.event_name || sa.event_name || relatedOrder?.custom_event_name || relatedOrder?.event_type || relatedLead?.custom_event_name || relatedLead?.event_type || 'Event Shoot';
      const resolvedEventTime = matchedEv?.reporting_time || matchedEv?.event_start_time || sa.reporting_time || (sa as any).event_start_time || relatedOrder?.event_time || relatedLead?.event_time || 'N/A';

      eqItems.forEach(eqName => {
        if (isReturnedForOrder(sa.order_id, relatedLead?.lead_id || relatedOrder?.lead_id, eqName)) return;
        recordAssignedGear({
          equipmentName: eqName,
          eventName: resolvedEventName,
          eventDate: resolvedEventDate || targetCalendarDate,
          eventTime: resolvedEventTime,
          assignedStaff: sa.staff_name || 'Assigned Staff',
          orderId: sa.order_id,
          leadId: relatedLead?.lead_id || relatedOrder?.lead_id,
          taskStatus: (sa as any).task_status || sa.assignment_status || 'Assigned',
          source: 'Staff Assignment',
          taskId: sa.assignment_id || `${sa.order_id}_${eqName}`
        });
      });
    });

    // 1B. Scan orders & leads events
    const scanContainerEvents = (container: any, sourceLabel: string) => {
      if (!container) return;
      if (completedStages.includes((container.current_stage || container.status || container.current_status || '').toLowerCase())) return;

      const ordId = container.order_id || container.lead_id;
      const ldId = container.lead_id || container.order_id;

      let evs = container.events;
      if (typeof evs === 'string') {
        try { evs = JSON.parse(evs); } catch (_) {}
      }

      if (Array.isArray(evs) && evs.length > 0) {
        evs.forEach((ev: any) => {
          if (!ev || typeof ev !== 'object') return;
          const evDate = ev.event_date || ev.Reporting_date || ev.reporting_date || ev.event_start_date || container.event_date;
          if (!isDateMatch(evDate, targetCalendarDate, ev.Event_End_Date || ev.event_end_date)) return;

          const evGear = [
            ...parseEquipmentList(ev.assigned_equipment),
            ...parseEquipmentList(ev.equipment),
            ...parseEquipmentList(ev.equipment_kit),
            ...extractEquipmentFromStaffMobiles(ev.assigned_staff_mobiles)
          ];

          const evName = ev.event_name || ev.custom_event_name || ev.event_type || container.custom_event_name || container.event_type || 'Event Shoot';
          const evTime = ev.reporting_time || ev.event_start_time || ev.event_time || container.event_time || 'N/A';
          const evStaff = ev.assigned_staff_names || 'Assigned Crew';

          evGear.forEach(gearName => {
            if (isReturnedForOrder(ordId, ldId, gearName)) return;
            recordAssignedGear({
              equipmentName: gearName,
              eventName: evName,
              eventDate: evDate || targetCalendarDate,
              eventTime: evTime,
              assignedStaff: evStaff,
              orderId: ordId,
              leadId: ldId,
              taskStatus: 'Assigned',
              source: sourceLabel,
              taskId: `${ordId}_${ev.id || 'ev'}_${gearName}`
            });
          });
        });
      }

      // Also check top-level container event date
      if (isDateMatch(container.event_date || container.Reporting_date, targetCalendarDate, container.event_end_date)) {
        const topGear = parseEquipmentList(container.assigned_equipment);
        const evName = container.custom_event_name || container.event_type || 'Event Shoot';
        const evTime = container.event_time || 'N/A';
        topGear.forEach(gearName => {
          if (isReturnedForOrder(ordId, ldId, gearName)) return;
          recordAssignedGear({
            equipmentName: gearName,
            eventName: evName,
            eventDate: container.event_date || targetCalendarDate,
            eventTime: evTime,
            assignedStaff: 'Assigned Crew',
            orderId: ordId,
            leadId: ldId,
            taskStatus: 'Assigned',
            source: `${sourceLabel} Direct`,
            taskId: `${ordId}_top_${gearName}`
          });
        });
      }
    };

    (orders || []).forEach(o => scanContainerEvents(o, 'Order Event'));
    (leads || []).forEach(l => scanContainerEvents(l, 'Lead Event'));

    // 1C. Scan operations equipment_kit
    (operations || []).forEach(op => {
      if (!op.equipment_kit || !op.equipment_kit.trim()) return;
      if (completedStages.includes((op.event_status || '').toLowerCase())) return;
      if (['equipment handover completed', 'returned', 'equipment returned'].includes((op.equipment_status || '').toLowerCase())) return;

      const relatedOrder = orders?.find(o => o.order_id === op.order_id);
      const relatedLead = leads?.find(l => l.lead_id === (relatedOrder?.lead_id || op.order_id));
      if (relatedOrder && completedStages.includes((relatedOrder.current_stage || '').toLowerCase())) return;
      if (relatedLead && completedStages.includes((relatedLead.status || relatedLead.current_status || '').toLowerCase())) return;

      const resolvedOpDate = op.event_date || relatedOrder?.event_date || relatedLead?.event_date;
      if (!isDateMatch(resolvedOpDate, targetCalendarDate)) return;

      const opKits = parseEquipmentList(op.equipment_kit);
      const evName = op.event_name || relatedOrder?.custom_event_name || relatedOrder?.event_type || 'Production Shoot';
      const evTime = relatedOrder?.event_time || relatedLead?.event_time || 'N/A';
      const opStaff = op.photographer_assigned || op.videographer_assigned || op.drone_operator_assigned || 'Production Crew';

      opKits.forEach(gearName => {
        if (isReturnedForOrder(op.order_id, relatedOrder?.lead_id || relatedLead?.lead_id, gearName)) return;
        recordAssignedGear({
          equipmentName: gearName,
          eventName: evName,
          eventDate: resolvedOpDate || targetCalendarDate,
          eventTime: evTime,
          assignedStaff: opStaff,
          orderId: op.order_id,
          leadId: relatedOrder?.lead_id || relatedLead?.lead_id,
          taskStatus: op.event_status || 'Operations Assigned',
          source: 'Operations Kit',
          taskId: `${op.order_id}_op_${gearName}`
        });
      });
    });

    // 1D. Scan leadEquipmentHistory
    (leadEquipmentHistory || []).forEach(h => {
      if (h.returned_at || h.equipment_status === 'Returned' || h.equipment_status === 'Equipment Handover Completed') return;
      const histDate = h.event_date || h.checkout_date;
      if (!isDateMatch(histDate, targetCalendarDate)) return;

      const ordId = h.order_id || h.lead_id || 'HIST';
      recordAssignedGear({
        equipmentName: h.equipment_name,
        eventName: h.event_name || 'Event Assignment',
        eventDate: histDate || targetCalendarDate,
        eventTime: 'N/A',
        assignedStaff: h.returned_by || 'Assigned Crew',
        orderId: ordId,
        leadId: h.lead_id,
        taskStatus: h.equipment_status || 'In Use',
        source: 'Equipment History',
        taskId: `${ordId}_hist_${h.id || h.equipment_name}`
      });
    });

    // STEP 2: Map over existing equipment and match against assigned gear for targetCalendarDate
    const matchedAssignedGearIndices = new Set<number>();

    const processedEquipment = equipment.map(item => {
      const meta = parseEquipmentNotes(item.notes);
      const eqId = (item.equipment_id || '').trim().toLowerCase();
      const eqName = (item.equipment_name || '').trim().toLowerCase();
      const brand = (item.brand || '').trim().toLowerCase();
      const model = (item.model || '').trim().toLowerCase();
      const serial = (item.serial_number || '').trim().toLowerCase();
      const fullName = `${brand} ${model}`.trim().toLowerCase();

      const normEqName = normalize(eqName);
      const normFullName = normalize(fullName);
      const normModel = model ? normalize(model) : '';

      const matchesItem = (rawStr: string): boolean => {
        if (!rawStr) return false;
        const clean = rawStr.trim().toLowerCase();
        if (!clean) return false;
        const normClean = normalize(clean);

        if (eqId && clean === eqId) return true;
        if (serial && clean === serial) return true;
        if (clean === eqName || (normEqName && normClean === normEqName)) return true;
        if (fullName && (clean === fullName || (normFullName && normClean === normFullName))) return true;
        if (normEqName.length >= 3 && (normClean.includes(normEqName) || normEqName.includes(normClean))) return true;
        if (normModel.length >= 3 && (normClean.includes(normModel) || normModel.includes(normClean))) return true;
        return false;
      };

      const matchedTasks: ActiveEquipmentTask[] = [];
      assignedGearList.forEach((gear, gIdx) => {
        if (matchesItem(gear.equipmentName)) {
          matchedAssignedGearIndices.add(gIdx);
          matchedTasks.push({
            id: gear.taskId,
            orderId: gear.orderId,
            leadId: gear.leadId,
            eventName: gear.eventName,
            eventDate: gear.eventDate,
            eventTime: gear.eventTime,
            assignedStaff: gear.assignedStaff,
            taskStatus: gear.taskStatus,
            source: gear.source
          });
        }
      });

      const activeTaskCount = matchedTasks.length;
      let dynamicStatus = 'Available';
      if (['Under Maintenance', 'Maintenance', 'Damaged', 'Inactive'].includes(item.status)) {
        dynamicStatus = item.status;
      } else if (activeTaskCount > 0) {
        dynamicStatus = 'Busy';
      } else {
        dynamicStatus = 'Available';
      }

      const categoryName = getEquipmentCategory(item);

      return {
        ...item,
        parsedMeta: meta,
        activeTasks: matchedTasks,
        activeTaskCount,
        dynamicStatus,
        categoryName,
        assigned_quantity: item.quantity - (item.available_quantity ?? item.quantity)
      };
    });

    // STEP 3: If any equipment was assigned to an event on this date but was not in the equipment table,
    // synthesize an entry so that assigned equipment ALWAYS appears as BUSY against that event.
    const synthesizedItems: any[] = [];
    assignedGearList.forEach((gear, gIdx) => {
      if (!matchedAssignedGearIndices.has(gIdx)) {
        const inferredType = getEquipmentCategory({ equipment_name: gear.equipmentName });
        const inferredBrandName = inferBrand(gear.equipmentName);
        const synthId = `EQ-EV-${normalize(gear.equipmentName).slice(0, 12)}_${gIdx}`;

        synthesizedItems.push({
          equipment_id: synthId,
          equipment_name: gear.equipmentName,
          brand: inferredBrandName,
          model: '',
          serial_number: '',
          equipment_type: inferredType,
          categoryName: inferredType,
          quantity: 1,
          available_quantity: 0,
          status: 'Busy',
          dynamicStatus: 'Busy',
          purchase_date: targetCalendarDate,
          purchase_price: 0,
          storage_location: 'In Field / Event',
          notes: `Assigned for ${gear.eventName} (${gear.assignedStaff})`,
          created_at: new Date().toISOString(),
          parsedMeta: { condition: 'Good', assignedStaff: gear.assignedStaff, notes: `Assigned for ${gear.eventName}` },
          activeTasks: [{
            id: gear.taskId,
            orderId: gear.orderId,
            leadId: gear.leadId,
            eventName: gear.eventName,
            eventDate: gear.eventDate,
            eventTime: gear.eventTime,
            assignedStaff: gear.assignedStaff,
            taskStatus: gear.taskStatus,
            source: gear.source
          }],
          activeTaskCount: 1,
          assigned_quantity: 1
        });
      }
    });

    return [...processedEquipment, ...synthesizedItems];
  }, [equipment, selectedDate, staffAssignments, operations, leadEquipmentHistory, equipmentHandovers, orders, leads]);

  // 2. Compute Category-first Summary Table Data based on actual equipment records
  const categoriesSummary = useMemo(() => {
    const catMap = new Map<string, {
      category: string;
      totalUnits: number;
      availableCount: number;
      assignedCount: number;
      maintenanceCount: number;
    }>();

    allEquipmentWithStatus.forEach(item => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const match = 
          item.equipment_name.toLowerCase().includes(query) ||
          item.categoryName.toLowerCase().includes(query) ||
          item.brand.toLowerCase().includes(query) ||
          (item.model && item.model.toLowerCase().includes(query)) ||
          (item.serial_number && item.serial_number.toLowerCase().includes(query));
        if (!match) return;
      }

      const cat = item.categoryName || 'Other';
      if (!catMap.has(cat)) {
        catMap.set(cat, {
          category: cat,
          totalUnits: 0,
          availableCount: 0,
          assignedCount: 0,
          maintenanceCount: 0
        });
      }
      const entry = catMap.get(cat)!;
      entry.totalUnits += (item.quantity || 1);
      if (item.dynamicStatus === 'Busy') {
        entry.assignedCount += (item.quantity || 1);
      } else if (item.dynamicStatus === 'Available') {
        entry.availableCount += (item.quantity || 1);
      } else {
        entry.maintenanceCount += (item.quantity || 1);
      }
    });

    return Array.from(catMap.values()).sort((a, b) => a.category.localeCompare(b.category));
  }, [allEquipmentWithStatus, searchQuery]);

  // Filtered and sorted equipment list for the selected event date
  const filteredAndSortedEquipment = useMemo(() => {
    let result = allEquipmentWithStatus;

    // 1. Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(eq => {
        return (
          eq.equipment_id.toLowerCase().includes(query) ||
          eq.equipment_name.toLowerCase().includes(query) ||
          eq.categoryName.toLowerCase().includes(query) ||
          eq.brand.toLowerCase().includes(query) ||
          (eq.model && eq.model.toLowerCase().includes(query)) ||
          (eq.serial_number && eq.serial_number.toLowerCase().includes(query)) ||
          eq.dynamicStatus.toLowerCase().includes(query) ||
          eq.status.toLowerCase().includes(query) ||
          (eq.storage_location && eq.storage_location.toLowerCase().includes(query)) ||
          eq.parsedMeta.condition.toLowerCase().includes(query) ||
          eq.parsedMeta.assignedStaff.toLowerCase().includes(query) ||
          eq.parsedMeta.notes.toLowerCase().includes(query) ||
          eq.activeTasks.some(t => t.eventName.toLowerCase().includes(query) || t.assignedStaff.toLowerCase().includes(query))
        );
      });
    }

    // 2. Category filter
    const activeCategory = filters.type;
    if (activeCategory && activeCategory !== 'All') {
      result = result.filter(eq => 
        eq.categoryName.toLowerCase() === activeCategory.toLowerCase()
      );
    }

    // 3. Status filter
    if (filters.status !== 'All') {
      result = result.filter(eq => {
        if (filters.status === 'Available') return eq.dynamicStatus === 'Available';
        if (filters.status === 'Busy' || filters.status === 'Assigned' || filters.status === 'In Use') return eq.dynamicStatus === 'Busy';
        if (filters.status === 'Under Maintenance' || filters.status === 'Maintenance') return eq.dynamicStatus === 'Under Maintenance' || eq.dynamicStatus === 'Maintenance';
        if (filters.status === 'Inactive') return eq.dynamicStatus === 'Inactive';
        return eq.dynamicStatus === filters.status || eq.status === filters.status;
      });
    }

    // 4. Brand filter
    if (filters.brand !== 'All') {
      result = result.filter(eq => eq.brand === filters.brand);
    }

    // 5. Condition filter
    if (filters.condition !== 'All') {
      result = result.filter(eq => eq.parsedMeta.condition === filters.condition);
    }

    // 6. Sorting logic
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.equipment_name.localeCompare(b.equipment_name);
        case 'name-desc':
          return b.equipment_name.localeCompare(a.equipment_name);
        case 'task-desc':
          return b.activeTaskCount - a.activeTaskCount;
        case 'task-asc':
          return a.activeTaskCount - b.activeTaskCount;
        case 'qty-desc':
          return b.quantity - a.quantity;
        case 'qty-asc':
          return a.quantity - b.quantity;
        case 'avail-desc':
          return (a.dynamicStatus === 'Available' ? 1 : 0) - (b.dynamicStatus === 'Available' ? 1 : 0);
        case 'condition-desc':
          return a.parsedMeta.condition.localeCompare(b.parsedMeta.condition);
        default:
          return 0;
      }
    });

    return result;
  }, [allEquipmentWithStatus, searchQuery, filters, sortBy]);

  // Overall metrics calculated dynamically from allEquipmentWithStatus for selected date
  const metrics = useMemo(() => {
    let totalUnits = 0;
    let availableCount = 0;
    let busyCount = 0;
    let maintenanceCount = 0;

    allEquipmentWithStatus.forEach(item => {
      const qty = item.quantity || 1;
      totalUnits += qty;
      if (['Under Maintenance', 'Maintenance', 'Damaged', 'Inactive'].includes(item.dynamicStatus)) {
        maintenanceCount += qty;
      } else if (item.dynamicStatus === 'Busy') {
        busyCount += qty;
      } else {
        availableCount += qty;
      }
    });

    return { totalUnits, availableCount, busyCount, maintenanceCount };
  }, [allEquipmentWithStatus]);

  // Reset pagination to page 1 on search or filter updates
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters, sortBy, selectedDate]);

  // Paginated categories calculation
  const paginatedCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return categoriesSummary.slice(startIndex, startIndex + pageSize);
  }, [categoriesSummary, currentPage, pageSize]);

  // Paginated equipment calculation
  const paginatedEquipment = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedEquipment.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedEquipment, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (!selectedCategoryView) {
      return Math.ceil(categoriesSummary.length / pageSize) || 1;
    }
    return Math.ceil(filteredAndSortedEquipment.length / pageSize) || 1;
  }, [selectedCategoryView, categoriesSummary.length, filteredAndSortedEquipment.length, pageSize]);

  // Handler for downloading category-wise equipment report CSV
  const handleDownloadEquipmentReport = () => {
    const itemsToReport = filteredAndSortedEquipment;
    if (!itemsToReport || itemsToReport.length === 0) {
      showToast('error', 'No equipment records available for the selected filter.');
      return;
    }

    // Sort category-wise first, then by equipment name
    const sortedForReport = [...itemsToReport].sort((a, b) => {
      const catA = (a.categoryName || 'Other').toLowerCase();
      const catB = (b.categoryName || 'Other').toLowerCase();
      if (catA !== catB) return catA.localeCompare(catB);
      return (a.equipment_name || '').localeCompare(b.equipment_name || '');
    });

    const headers = [
      'S.No',
      'Equipment Name',
      'Equipment Category',
      'Equipment ID',
      'Quantity',
      'Available Quantity',
      'Assigned Quantity',
      'Current Status',
      'Brand',
      'Model',
      'Serial Number',
      'Condition',
      'Storage Location',
      'Current Assignment / Event Shoot',
      'Notes / Remarks'
    ];

    const csvRows = [headers];

    sortedForReport.forEach((item, idx) => {
      const assignedQty = item.quantity - (item.available_quantity ?? item.quantity);
      const activeTasksSummary = item.activeTasks && item.activeTasks.length > 0
        ? item.activeTasks.map((t: any) => `${t.eventName} (${t.assignedStaff || 'Unassigned'}) [${t.orderId}]`).join('; ')
        : 'None';

      csvRows.push([
        String(idx + 1),
        item.equipment_name || '—',
        item.categoryName || 'Other',
        item.equipment_id || '—',
        String(item.quantity ?? 1),
        String(item.available_quantity ?? (item.dynamicStatus === 'Available' ? item.quantity : 0)),
        String(assignedQty > 0 ? assignedQty : (item.dynamicStatus === 'Busy' ? item.quantity : 0)),
        item.dynamicStatus || item.status || 'Available',
        item.brand || '—',
        item.model || '—',
        item.serial_number || '—',
        item.parsedMeta?.condition || 'Excellent',
        item.storage_location || 'Main Studio',
        activeTasksSummary,
        item.parsedMeta?.notes || item.notes || '—'
      ]);
    });

    const csvString = '\uFEFF' + csvRows.map(row => 
      row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = selectedDate || new Date().toISOString().split('T')[0];
    const filterSuffix = filters.type !== 'All' ? `_${filters.type.replace(/\s+/g, '_')}` : '';
    link.setAttribute('download', `Equipment_Report_${dateStr}${filterSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('success', `Equipment report downloaded successfully (${sortedForReport.length} items).`);
  };

  return (
    <div className="space-y-6 font-sans relative">
      
      {/* Dynamic Toast Notice */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl animate-in slide-in-from-top duration-300 ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 border-emerald-500/35 text-emerald-400' 
            : 'bg-rose-950/90 border-rose-500/35 text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />}
          <span className="text-xs font-mono font-bold tracking-wide">{toast.message}</span>
          <button onClick={() => setToast(null)} className="p-1 hover:bg-white/10 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Dashboard Metrics Header with Date Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
        <h2 className="text-xs font-mono font-black uppercase text-zinc-500">
          Inventory Status for: <span className="text-zinc-200">{formatDateDDMMYY(selectedDate)}</span>
        </h2>
        <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-850 rounded-xl px-3 py-1.5 shadow-sm">
          <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[10px] font-mono font-bold uppercase text-zinc-400">Assignment / Event Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs font-mono text-amber-400 focus:outline-none focus:border-amber-500 cursor-pointer"
            title="Select Assignment / Event Date"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { 
            title: 'TOTAL UNITS', 
            val: metrics.totalUnits, 
            color: 'text-zinc-200', 
            bg: 'bg-zinc-900/40 border-zinc-850' 
          },
          { 
            title: 'AVAILABLE NOW', 
            val: metrics.availableCount, 
            color: 'text-emerald-400', 
            bg: 'bg-emerald-500/5 border-emerald-500/10' 
          },
          { 
            title: 'BUSY / IN FIELD', 
            val: metrics.busyCount, 
            color: 'text-sky-400', 
            bg: 'bg-sky-500/5 border-sky-500/10' 
          },
          { 
            title: 'IN MAINTENANCE', 
            val: metrics.maintenanceCount, 
            color: 'text-amber-400', 
            bg: 'bg-amber-500/5 border-amber-500/10' 
          }
        ].map((m, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border ${m.bg} flex flex-col justify-between`}>
            <span className="text-[9px] font-mono font-black uppercase tracking-widest text-zinc-500">{m.title}</span>
            <span className={`text-xl font-bold mt-2 font-mono ${m.color}`}>{m.val}</span>
          </div>
        ))}
      </div>

      {/* Search & Global Filters Bar */}
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search equipment by name, category, brand, condition, serial number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-850 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-full text-zinc-400 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              id="btn_add_equipment_category"
              onClick={() => {
                setNewCategoryName('');
                setNewCategoryError('');
                setShowAddCategoryModal(true);
              }}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-750 hover:border-amber-500/50 text-[10px] sm:text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-zinc-900 hover:bg-zinc-850 text-zinc-200 hover:text-white shrink-0 w-full sm:w-auto shadow-sm"
              title="Add a new equipment category"
            >
              <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Add Equipment Category</span>
            </button>
            <button
              type="button"
              id="btn_download_equipment_report"
              onClick={handleDownloadEquipmentReport}
              className="px-3.5 py-2.5 rounded-xl border border-emerald-500/30 text-[10px] sm:text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 shrink-0 w-full sm:w-auto shadow-sm"
              title="Download category-wise equipment report CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Report</span>
            </button>
            <button
              type="button"
              onClick={() => { setEditingId(null); setShowGearForm(true); }}
              className="px-3.5 py-2.5 rounded-xl border text-[10px] sm:text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all cursor-pointer bg-amber-500 hover:bg-amber-600 text-black shrink-0 w-full sm:w-auto"
            >
              + Register New Studio Gear
            </button>
            <button
              type="button"
              id="btn_equipment_filter_toggle"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3.5 py-2.5 rounded-xl border text-[10px] sm:text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 w-full sm:w-auto ${
                showFilters 
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' 
                  : 'bg-zinc-950 border-zinc-850 text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>FILTER</span>
              {(filters.type !== 'All' || filters.status !== 'All' || filters.condition !== 'All' || filters.brand !== 'All') && (
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div className="pt-3 border-t border-zinc-850/80 space-y-3 animate-fade-in">
            <div className="flex flex-wrap gap-2 w-full">
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-850 rounded-xl px-2.5 py-1.5">
                <Filter className="w-3 h-3 text-zinc-500" />
                <span className="text-[10px] text-zinc-400 font-mono">Filters:</span>
              </div>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none"
                title="Select Assignment/Event Date"
              />

              <select
                value={selectedCategoryView || filters.type}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters({...filters, type: val});
                  setSelectedCategoryView(val === 'All' ? null : val);
                  setCurrentPage(1);
                }}
                className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none"
              >
                <option value="All">All Categories</option>
                {uniqueCategories.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none"
              >
                <option value="All">All Status</option>
                {['Available', 'Assigned', 'In Use', 'Under Maintenance', 'Damaged', 'Lost', 'Retired'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={filters.condition}
                onChange={(e) => setFilters({...filters, condition: e.target.value})}
                className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none"
              >
                <option value="All">All Conditions</option>
                {['Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Retired'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={filters.brand}
                onChange={(e) => setFilters({...filters, brand: e.target.value})}
                className="bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none"
              >
                <option value="All">All Brands</option>
                {uniqueBrands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Sorting Controller Row */}
        <div className="flex justify-between items-center border-t border-zinc-850/60 pt-3 text-[11px]">
          <span className="text-zinc-500 font-mono">Found {filteredAndSortedEquipment.length} items matching criteria</span>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-mono">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-zinc-950 border border-zinc-850 rounded-lg px-2 py-1 font-mono text-zinc-300 focus:outline-none"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="qty-desc">Quantity (High-Low)</option>
              <option value="qty-asc">Quantity (Low-High)</option>
              <option value="avail-desc">Available (High-Low)</option>
              <option value="assigned-desc">Assigned (High-Low)</option>
              <option value="condition-desc">Condition (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 items-start">
        {/* Add Equipment Category Modal */}
        {showAddCategoryModal && (
          <div 
            className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => {
              setShowAddCategoryModal(false);
              setNewCategoryError('');
              setNewCategoryName('');
            }}
          >
            <div 
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl w-full max-w-md relative flex flex-col gap-4 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-mono font-black uppercase text-zinc-200 tracking-wider">
                    Add Equipment Category
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCategoryModal(false);
                    setNewCategoryError('');
                    setNewCategoryName('');
                  }}
                  className="text-zinc-400 hover:text-white p-1 rounded-full bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveNewCategory} className="space-y-4">
                <div>
                  <label htmlFor="new_category_name_input" className="block text-[10px] font-mono font-extrabold uppercase text-zinc-400 mb-1.5">
                    Category Name
                  </label>
                  <input
                    id="new_category_name_input"
                    aria-label="Category Name"
                    type="text"
                    placeholder="e.g. Lighting Modifiers, Drone Accessories..."
                    value={newCategoryName}
                    autoFocus
                    onChange={(e) => {
                      setNewCategoryName(e.target.value);
                      if (newCategoryError) setNewCategoryError('');
                    }}
                    className={`w-full bg-zinc-955 border ${newCategoryError ? 'border-rose-500 focus:border-rose-500' : 'border-zinc-800 focus:border-amber-500/50'} rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono transition-colors`}
                  />
                  {newCategoryError && (
                    <p className="text-rose-400 text-[10px] mt-1.5 font-mono flex items-center gap-1">
                      <span>⚠️</span> {newCategoryError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-850">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCategoryModal(false);
                      setNewCategoryError('');
                      setNewCategoryName('');
                    }}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn_save_equipment_category"
                    type="submit"
                    disabled={isSavingCategory}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-black font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                  >
                    <span>{isSavingCategory ? 'Saving...' : 'Save Category'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Gear Form Modal */}
        {showGearForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
            <div id="equipment_registry_form" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xl w-full max-w-lg relative flex flex-col max-h-[85vh] sm:max-h-[80vh] min-h-0 overflow-hidden">
              {/* Sticky Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850 shrink-0">
                <h3 className="text-xs font-mono font-black uppercase text-zinc-300 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-amber-500" />
                  <span>{editingId ? 'Edit Register Details' : 'Register New Studio Gear'}</span>
                </h3>
                <button 
                  type="button"
                  onClick={() => { setEditingId(null); setShowGearForm(false); }} 
                  className="text-zinc-400 hover:text-white p-1 rounded-full bg-zinc-800/50 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden mt-3">
                {/* Scrollable Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1.5 py-1 space-y-4 modal-scroll-area">
                  <fieldset disabled={!canEdit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono font-extrabold uppercase text-zinc-500 mb-1 font-semibold">
                        Equipment Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sony FX3 Full Cinema body"
                        value={form.equipment_name}
                        onChange={(e) => {
                          setForm({ ...form, equipment_name: e.target.value });
                          if (e.target.value) setFormErrors(prev => prev.filter(err => err !== 'equipment_name'));
                        }}
                        className={`w-full bg-zinc-955 border ${formErrors.includes('equipment_name') ? 'border-rose-500' : 'border-zinc-850'} rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 font-mono`}
                      />
                      {formErrors.includes('equipment_name') && (
                        <p className="text-rose-500 text-[10px] mt-1 font-mono">❌ Please fill all required fields.</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-extrabold uppercase text-zinc-500 mb-1 font-semibold">
                        Brand *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sony"
                        value={form.brand}
                        onChange={(e) => {
                          setForm({ ...form, brand: e.target.value });
                          if (e.target.value) setFormErrors(prev => prev.filter(err => err !== 'brand'));
                        }}
                        className={`w-full bg-zinc-955 border ${formErrors.includes('brand') ? 'border-rose-500' : 'border-zinc-850'} rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 font-mono`}
                      />
                      {formErrors.includes('brand') && (
                        <p className="text-rose-500 text-[10px] mt-1 font-mono">❌ Please fill all required fields.</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-mono font-extrabold uppercase text-zinc-500 font-semibold">
                          Equipment Category *
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewCategoryName('');
                            setNewCategoryError('');
                            setShowAddCategoryModal(true);
                          }}
                          className="text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          + Add Category
                        </button>
                      </div>
                      <select
                        value={form.equipment_type}
                        onChange={(e) => {
                          setForm({ ...form, equipment_type: e.target.value });
                          if (e.target.value) setFormErrors(prev => prev.filter(err => err !== 'equipment_type'));
                        }}
                        className={`w-full bg-zinc-955 border ${formErrors.includes('equipment_type') ? 'border-rose-500' : 'border-zinc-850'} rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 font-mono`}
                      >
                        <option value="" disabled>Select Category</option>
                        {allEquipmentCategories.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      {formErrors.includes('equipment_type') && (
                        <p className="text-rose-500 text-[10px] mt-1 font-mono">❌ Please fill all required fields.</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono font-extrabold uppercase text-zinc-500 mb-1 font-semibold">
                        Equipment Status *
                      </label>
                      <select
                        value={form.status}
                        onChange={(e) => {
                          setForm({ ...form, status: e.target.value });
                          if (e.target.value) setFormErrors(prev => prev.filter(err => err !== 'status'));
                        }}
                        className={`w-full bg-zinc-955 border ${formErrors.includes('status') ? 'border-rose-500' : 'border-zinc-850'} rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 font-mono`}
                      >
                        <option value="" disabled>Select Status</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                      {formErrors.includes('status') && (
                        <p className="text-rose-500 text-[10px] mt-1 font-mono">❌ Please fill all required fields.</p>
                      )}
                    </div>
                  </fieldset>
                </div>

                {/* Sticky Action Footer */}
                <div className="sticky bottom-0 bg-zinc-900/95 backdrop-blur-sm pt-3 pb-1 border-t border-zinc-850 shrink-0 mt-auto z-10">
                  {canEdit ? (
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl cursor-pointer text-xs transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl cursor-pointer flex items-center gap-1 text-xs shadow-md transition-all active:scale-95"
                      >
                        <span>{editingId ? 'Update Gear' : 'Add to Inventory'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg text-[10px] text-zinc-500 font-mono text-center">
                      🔒 Read-only mode access.
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Inventory View */}
        <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl overflow-hidden shadow-xl">
          {/* Header Banner */}
          <div className="p-4 border-b border-zinc-850 bg-zinc-950/70 flex flex-wrap items-center justify-between gap-2">
            {selectedCategoryView ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryView(null);
                    setFilters(prev => ({ ...prev, type: 'All' }));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold"
                  title="Return to category list"
                >
                  <ChevronLeft className="w-4 h-4 text-amber-500" />
                  <span>Back to Categories</span>
                </button>
                <span className="text-zinc-600 font-mono">/</span>
                <h3 className="text-xs font-mono font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-500" />
                  <span>{selectedCategoryView} ({filteredAndSortedEquipment.length} ITEMS)</span>
                </h3>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-amber-500" />
                <h3 className="text-[10px] font-mono font-black text-zinc-300 uppercase tracking-widest">
                  EQUIPMENT CATEGORIES ({categoriesSummary.length} CATEGORIES)
                </h3>
              </div>
            )}

            {selectedCategoryView ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryView(null);
                  setFilters(prev => ({ ...prev, type: 'All' }));
                  setCurrentPage(1);
                }}
                className="text-xs font-mono text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
              >
                ✕ Close Category View
              </button>
            ) : (
              <span className="text-[11px] font-mono text-zinc-500">
                Click any category row or &quot;View&quot; to inspect all equipment
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            {!selectedCategoryView ? (
              /* CATEGORY-FIRST TABLE VIEW */
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="border-b border-zinc-850 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-950/40">
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5 text-center">Total Equipment</th>
                    <th className="p-3.5 text-center">Available</th>
                    <th className="p-3.5 text-center">Assigned</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60 text-xs text-zinc-300">
                  {paginatedCategories.length > 0 ? (
                    paginatedCategories.map((cat) => (
                      <tr 
                        key={cat.category} 
                        onClick={() => {
                          setSelectedCategoryView(cat.category);
                          setFilters(prev => ({ ...prev, type: cat.category }));
                          setCurrentPage(1);
                        }}
                        className="hover:bg-zinc-950/40 transition-all cursor-pointer group"
                      >
                        {/* Category */}
                        <td className="p-3.5 font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/20 transition-all shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">{cat.category}</div>
                              <div className="text-[10px] font-mono text-zinc-500">Click to view all {cat.category.toLowerCase()} units</div>
                            </div>
                          </div>
                        </td>

                        {/* Total Equipment */}
                        <td className="p-3.5 text-center font-mono font-bold text-zinc-200 text-sm">
                          {cat.totalUnits}
                        </td>

                        {/* Available */}
                        <td className="p-3.5 text-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            {cat.availableCount}
                          </span>
                        </td>

                        {/* Assigned */}
                        <td className="p-3.5 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase border ${
                            cat.assignedCount > 0 
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' 
                              : 'bg-zinc-850/60 text-zinc-400 border-zinc-750'
                          }`}>
                            {cat.assignedCount > 0 && <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />}
                            {cat.assignedCount}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="p-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategoryView(cat.category);
                              setFilters(prev => ({ ...prev, type: cat.category }));
                              setCurrentPage(1);
                            }}
                            className="px-3.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 hover:gap-2 shadow-sm"
                          >
                            <span>View</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-zinc-500 italic font-mono">
                        No equipment categories found matching criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* CATEGORY DRILL-DOWN: ALL EQUIPMENT IN SELECTED CATEGORY */
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr className="border-b border-zinc-850 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-950/40">
                    <th className="p-3.5">S.NO.</th>
                    <th className="p-3.5">Equipment</th>
                    <th className="p-3.5">Brand</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-center">Task</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60 text-xs text-zinc-300">
                  {paginatedEquipment.length > 0 ? (
                    paginatedEquipment.map((eq, idx) => {
                      return (
                        <tr 
                          key={eq.equipment_id} 
                          onClick={() => setSelectedEq(eq)}
                          className="hover:bg-zinc-950/30 transition-all cursor-pointer group"
                        >
                          {/* S.NO. */}
                          <td className="p-3.5 text-zinc-500 font-mono text-center">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>

                          {/* Equipment Name & Serial */}
                          <td className="p-3.5">
                            <div className="font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">{eq.equipment_name}</div>
                            {eq.model && <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Model: <span className="text-zinc-300">{eq.model}</span></div>}
                            {eq.serial_number && <div className="text-[9px] text-zinc-500 font-bold uppercase font-mono">S/N: {eq.serial_number}</div>}
                          </td>

                          {/* Brand */}
                          <td className="p-3.5 font-mono text-zinc-300 font-medium">
                            {eq.brand || '—'}
                          </td>

                          {/* Category */}
                          <td className="p-3.5 font-mono text-zinc-400 text-[11px]">
                            {eq.categoryName}
                          </td>

                          {/* Status */}
                          <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                            {eq.dynamicStatus === 'Busy' ? (
                              <button
                                type="button"
                                onClick={() => setBusyEquipment({ equipment: eq, tasks: eq.activeTasks })}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/25 hover:text-sky-300 transition-all cursor-pointer"
                                title="Click to view active task assignments"
                              >
                                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
                                Busy
                              </button>
                            ) : eq.dynamicStatus === 'Available' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                                Available
                              </span>
                            ) : eq.dynamicStatus === 'Under Maintenance' || eq.dynamicStatus === 'Maintenance' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">
                                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                                {eq.dynamicStatus}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border bg-rose-500/10 text-rose-400 border-rose-500/20">
                                <span className="w-1.5 h-1.5 bg-rose-400 rounded-full" />
                                {eq.dynamicStatus}
                              </span>
                            )}
                          </td>

                          {/* Task Count Column */}
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setBusyEquipment({ equipment: eq, tasks: eq.activeTasks })}
                              className={`inline-flex items-center justify-center min-w-[28px] px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border transition-all cursor-pointer ${
                                eq.activeTaskCount > 0
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25 hover:scale-105 shadow-sm'
                                  : 'bg-zinc-850/60 text-zinc-400 border-zinc-750 hover:bg-zinc-800 hover:text-zinc-300'
                              }`}
                              title={eq.activeTaskCount > 0 ? `Click to view ${eq.activeTaskCount} active task(s)` : 'No active tasks (Click to inspect)'}
                            >
                              {eq.activeTaskCount}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEq(eq);
                                }}
                                className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-all border border-transparent hover:border-zinc-800 cursor-pointer"
                                title="View Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  onClick={(e) => handleSelectEdit(eq, e)}
                                  className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-all border border-transparent hover:border-zinc-800 cursor-pointer"
                                  title="Edit Item Details"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-zinc-500 italic font-mono">
                        No equipment found in category &quot;{selectedCategoryView}&quot; matching your search or filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Interactive Pagination footer */}
          <div className="p-4 border-t border-zinc-850/60 bg-zinc-950/30 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-4">
              <span className="text-zinc-500">
                {selectedCategoryView ? (
                  <>
                    Showing {filteredAndSortedEquipment.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filteredAndSortedEquipment.length)} of {filteredAndSortedEquipment.length} items in &quot;{selectedCategoryView}&quot;
                  </>
                ) : (
                  <>
                    Showing {categoriesSummary.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, categoriesSummary.length)} of {categoriesSummary.length} categories ({allEquipmentWithStatus.length} total units)
                  </>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">Per Page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-zinc-950 border border-zinc-850 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 focus:outline-none"
                >
                  {[5, 10, 20, 50].map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold ${
                      currentPage === page 
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                        : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Equipment Details Slide-over Panel or Modal */}
      {selectedEq && (() => {
        const meta = parseEquipmentNotes(selectedEq.notes);
        const assigned_quantity = selectedEq.quantity - (selectedEq.available_quantity ?? selectedEq.quantity);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] min-h-0 animate-in zoom-in-95 duration-200">
              
              {/* Header block */}
              <div className="p-4 sm:p-6 border-b border-zinc-850 bg-zinc-950/80 flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded uppercase font-extrabold tracking-widest">
                      {selectedEq.equipment_id}
                    </span>
                    <span className="text-zinc-500 font-mono text-xs">/ {selectedEq.equipment_type}</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-bold text-white mt-1.5">{selectedEq.equipment_name}</h4>
                </div>
                <button 
                  onClick={() => setSelectedEq(null)} 
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body content (Bento-style layout) */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6 text-xs text-zinc-300">
                
                {/* Visual statistics grid */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-zinc-950/60 border border-zinc-850 rounded-2xl">
                    <span className="text-[9px] font-mono text-zinc-500 block uppercase font-bold tracking-wider">Total Stock</span>
                    <span className="text-lg font-bold text-white font-mono block mt-1">{selectedEq.quantity}</span>
                  </div>
                  <div className="p-3 bg-zinc-950/60 border border-zinc-850 rounded-2xl">
                    <span className="text-[9px] font-mono text-zinc-500 block uppercase font-bold tracking-wider">Available</span>
                    <span className="text-lg font-bold text-emerald-400 font-mono block mt-1">{selectedEq.available_quantity}</span>
                  </div>
                  <div className="p-3 bg-zinc-950/60 border border-zinc-850 rounded-2xl">
                    <span className="text-[9px] font-mono text-zinc-500 block uppercase font-bold tracking-wider">Assigned Out</span>
                    <span className="text-lg font-bold text-sky-400 font-mono block mt-1">{assigned_quantity}</span>
                  </div>
                </div>

                {/* Details list inside card */}
                <div className="bg-[#09090b]/40 border border-zinc-850 rounded-2xl p-4.5 space-y-4">
                  <h5 className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-850 pb-2 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-amber-500" />
                    <span>SYSTEM IDENTIFICATION & SPECIFICATIONS</span>
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Manufacturer Brand</span>
                      <span className="text-white font-bold">{selectedEq.brand || 'N/A'}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Model Name</span>
                      <span className="text-white font-bold">{selectedEq.model || 'N/A'}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Serial Number (S/N)</span>
                      <span className="text-zinc-200 font-mono font-semibold">{selectedEq.serial_number || 'N/A'}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Operational Condition</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        meta.condition === 'Excellent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        meta.condition === 'Good' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                        meta.condition === 'Fair' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                        'bg-rose-500/10 text-rose-450 border-rose-500/20'
                      }`}>
                        {meta.condition}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Current Dispatch Status</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        selectedEq.status === 'Available' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        selectedEq.status === 'Assigned' || selectedEq.status === 'In Use' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                        selectedEq.status === 'Under Maintenance' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                        'bg-rose-500/10 text-rose-450 border-rose-500/20'
                      }`}>
                        {selectedEq.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Storage & Placement</span>
                      <div className="flex items-center gap-1 text-zinc-200">
                        <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{selectedEq.storage_location || 'Not Specified'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Logistics & Purchase info card */}
                <div className="bg-[#09090b]/40 border border-zinc-850 rounded-2xl p-4.5 space-y-4">
                  <h5 className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-850 pb-2 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <span>FINANCIALS & DISPATCH ASSIGNMENTS</span>
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Purchase Price</span>
                      <span className="text-white font-bold font-mono">
                        {selectedEq.purchase_price ? `₹${selectedEq.purchase_price.toLocaleString('en-IN')}` : 'N/A'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Purchase Date</span>
                      <span className="text-zinc-200 font-mono">{selectedEq.purchase_date ? formatDateDDMMYY(selectedEq.purchase_date) : 'N/A'}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-500 font-mono text-[10px] block uppercase">Assigned Custodian / Operator</span>
                      {meta.assignedStaff ? (
                        <div className="flex items-center gap-1.5 text-zinc-100 font-bold">
                          <User className="w-4 h-4 text-amber-500" />
                          <span>{meta.assignedStaff}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-500 italic">Unassigned (Stored in Locker)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Field report notes */}
                {meta.notes && (
                  <div className="bg-amber-500/[0.02] border border-amber-500/10 p-4.5 rounded-2xl space-y-2">
                    <span className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-widest block">NOTES & FIELD REPORTS</span>
                    <p className="text-zinc-350 leading-relaxed font-mono text-[11px] bg-zinc-950 p-3 rounded-xl border border-zinc-850 whitespace-pre-wrap">
                      {meta.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer controls */}
              <div className="p-4 bg-zinc-950/80 border-t border-zinc-850 flex justify-between gap-2.5">
                {canEdit ? (
                  <button
                    onClick={() => {
                      handleSelectEdit(selectedEq);
                      setSelectedEq(null);
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Details</span>
                  </button>
                ) : (
                  <div />
                )}
                <button
                  onClick={() => setSelectedEq(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl cursor-pointer"
                >
                  Close Details
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Equipment Active Task Count & Assignment Popup */}
      {busyEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] min-h-0 animate-in zoom-in-95 duration-200">
            
            {/* Header block */}
            <div className="p-4 sm:p-6 border-b border-zinc-855 bg-zinc-950/80 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded uppercase font-extrabold tracking-widest">
                    {busyEquipment.equipment.equipment_id}
                  </span>
                  <span className="text-zinc-500 font-mono text-xs">/ {busyEquipment.equipment.equipment_type || 'Gear'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
                    busyEquipment.tasks.length > 0
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {busyEquipment.tasks.length > 0 ? `${busyEquipment.tasks.length} ACTIVE TASK${busyEquipment.tasks.length > 1 ? 'S' : ''}` : '0 ACTIVE TASKS'}
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-white mt-1.5">{busyEquipment.equipment.equipment_name}</h4>
                <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                  Brand: <span className="text-zinc-300 font-medium">{busyEquipment.equipment.brand || '—'}</span>
                  {busyEquipment.equipment.model && <span> | Model: <span className="text-zinc-300 font-medium">{busyEquipment.equipment.model}</span></span>}
                  {busyEquipment.equipment.serial_number && <span> | S/N: <span className="text-zinc-300 font-mono font-medium">{busyEquipment.equipment.serial_number}</span></span>}
                </p>
              </div>
              <button 
                onClick={() => setBusyEquipment(null)} 
                className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
              {busyEquipment.tasks.length > 0 ? (
                <div className="overflow-x-auto border border-zinc-850 rounded-2xl bg-zinc-950/40">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-zinc-850 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-950/80">
                        <th className="p-3.5">Event Name</th>
                        <th className="p-3.5">Event Date</th>
                        <th className="p-3.5">Event Time</th>
                        <th className="p-3.5">Assigned Staff</th>
                        <th className="p-3.5">Order / Lead ID</th>
                        <th className="p-3.5 text-right">Task Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850/50 text-xs text-zinc-300">
                      {busyEquipment.tasks.map((task, idx) => (
                        <tr key={task.id || idx} className="hover:bg-zinc-900/40 transition-all">
                          <td className="p-3.5 font-bold text-zinc-100 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span>{task.eventName}</span>
                          </td>
                          <td className="p-3.5 font-mono text-zinc-300 font-medium">{formatDateDDMMYY(task.eventDate)}</td>
                          <td className="p-3.5 font-mono text-zinc-400">{formatTime12Hour(task.eventTime)}</td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                              <User className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                              <span>{task.assignedStaff}</span>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-[11px] text-zinc-400">
                            {task.orderId || task.leadId || '—'}
                          </td>
                          <td className="p-3.5 text-right">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">
                              {task.taskStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-10 text-center border border-zinc-850 rounded-2xl bg-zinc-950/25 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-zinc-200 font-bold text-sm">No Active Tasks Assigned</p>
                  <p className="text-zinc-500 font-mono text-xs">
                    This equipment is not currently engaged in any active event assignments or shoots. It is fully Available in inventory.
                  </p>
                </div>
              )}
            </div>

            {/* Footer block */}
            <div className="p-4 border-t border-zinc-850 bg-zinc-950/60 flex items-center justify-between shrink-0">
              <span className="text-[11px] font-mono text-zinc-500">
                {busyEquipment.tasks.length} active assignment{busyEquipment.tasks.length === 1 ? '' : 's'} resolved
              </span>
              <button
                onClick={() => setBusyEquipment(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-mono text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
