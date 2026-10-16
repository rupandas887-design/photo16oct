import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabaseClient } from '../supabaseClient';
import { CustomRole, CustomDeliverable } from '../types';
import { useRole } from './RoleContext';
import { 
  Users, 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  X, 
  ShieldAlert, 
  Check, 
  Search,
  Sparkles,
  Layers
} from 'lucide-react';
import { formatDateDDMMYY } from '../utils';

export const CustomPackageMaster: React.FC = () => {
  const { packages, leads, leadPackages, pushDelete, orders, staffAssignments } = useRole();

  // Active view tab: 'all' | 'roles' | 'deliverables'
  const [activeTab, setActiveTab] = useState<'all' | 'roles' | 'deliverables'>('all');

  // Master lists state
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [deliverables, setDeliverables] = useState<CustomDeliverable[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [deletingDeliverableId, setDeletingDeliverableId] = useState<string | null>(null);

  // Delete Confirmation & In-Use Modals state
  const [roleToDelete, setRoleToDelete] = useState<CustomRole | null>(null);
  const [inUseRoleModal, setInUseRoleModal] = useState<CustomRole | null>(null);
  const [deliverableToDelete, setDeliverableToDelete] = useState<CustomDeliverable | null>(null);
  const [inUseDeliverableModal, setInUseDeliverableModal] = useState<CustomDeliverable | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleName, setRoleName] = useState<string>('');
  const [roleDescription, setRoleDescription] = useState<string>('');
  const [roleError, setRoleError] = useState<string>('');

  const [showDeliverableModal, setShowDeliverableModal] = useState<boolean>(false);
  const [editingDeliverable, setEditingDeliverable] = useState<CustomDeliverable | null>(null);
  const [deliverableName, setDeliverableName] = useState<string>('');
  const [deliverableDescription, setDeliverableDescription] = useState<string>('');
  const [deliverableError, setDeliverableError] = useState<string>('');

  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Initial Default fallback items to ensure instant usability
  const defaultRoles: CustomRole[] = useMemo(() => [
    { id: 'cr-1', role_name: 'Lead Photographer', description: 'Primary photographer handling core shots', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cr-2', role_name: 'Candid Photographer', description: 'Photographer focusing on candid moments', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cr-3', role_name: 'Traditional Photographer', description: 'Photographer handling stage & family group photos', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cr-4', role_name: 'Lead Videographer', description: 'Primary cinematographer', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cr-5', role_name: 'Drone Operator', description: 'Aerial footage specialist', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cr-6', role_name: 'Assistant Photographer', description: 'Supporting photo crew member', status: 'Active', created_at: new Date().toISOString() }
  ], []);

  const defaultDeliverables: CustomDeliverable[] = useMemo(() => [
    { id: 'cd-1', deliverable_name: 'Traditional Photobook Album (30 Pages)', description: 'Premium hardbound album', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cd-2', deliverable_name: 'Candid Teaser Film (2-3 Mins)', description: 'High energy highlight teaser', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cd-3', deliverable_name: 'Full Length Ceremony Video (45-60 Mins)', description: 'Documentary style edit', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cd-4', deliverable_name: 'All Raw Photos via Drive Link', description: 'Unedited high-res JPEG/RAW files', status: 'Active', created_at: new Date().toISOString() },
    { id: 'cd-5', deliverable_name: 'Printed Frame (12x18 inch)', description: 'High quality portrait wall frame', status: 'Active', created_at: new Date().toISOString() }
  ], []);

  // Fetch Roles from Supabase
  const fetchRoles = useCallback(async () => {
    try {
      let deletedRoleKeys: string[] = [];
      try {
        const delKey = localStorage.getItem('erp_deleted_custom_role_ids');
        if (delKey) {
          const parsed = JSON.parse(delKey);
          if (Array.isArray(parsed)) deletedRoleKeys = parsed;
        }
      } catch (_) {}

      if (!supabaseClient) {
        const saved = localStorage.getItem('erp_custom_roles_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          setRoles(parsed.filter((r: any) => !deletedRoleKeys.includes(r.id) && !deletedRoleKeys.includes(r.role_name)));
        } else {
          setRoles(defaultRoles.filter(r => !deletedRoleKeys.includes(r.id) && !deletedRoleKeys.includes(r.role_name)));
        }
        return;
      }
      const { data, error } = await supabaseClient
        .from('custom_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch error for custom_roles (fallback active):', error.message);
        const saved = localStorage.getItem('erp_custom_roles_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          setRoles(parsed.filter((r: any) => !deletedRoleKeys.includes(r.id) && !deletedRoleKeys.includes(r.role_name)));
        } else {
          setRoles(defaultRoles.filter(r => !deletedRoleKeys.includes(r.id) && !deletedRoleKeys.includes(r.role_name)));
        }
      } else if (data) {
        const validRoles = data.filter(r => !deletedRoleKeys.includes(r.id) && !deletedRoleKeys.includes(r.role_name));
        setRoles(validRoles);
        localStorage.setItem('erp_custom_roles_data', JSON.stringify(validRoles));
      }
    } catch (e: any) {
      console.error('Error in fetchRoles:', e);
      const saved = localStorage.getItem('erp_custom_roles_data');
      if (saved) setRoles(JSON.parse(saved));
    }
  }, [defaultRoles]);

  // Fetch Deliverables from Supabase
  const fetchDeliverables = useCallback(async () => {
    try {
      let deletedDelKeys: string[] = [];
      try {
        const delKey = localStorage.getItem('erp_deleted_custom_deliverable_ids');
        if (delKey) {
          const parsed = JSON.parse(delKey);
          if (Array.isArray(parsed)) deletedDelKeys = parsed;
        }
      } catch (_) {}

      if (!supabaseClient) {
        const saved = localStorage.getItem('erp_custom_deliverables_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          setDeliverables(parsed.filter((d: any) => !deletedDelKeys.includes(d.id) && !deletedDelKeys.includes(d.deliverable_name)));
        } else {
          setDeliverables(defaultDeliverables.filter(d => !deletedDelKeys.includes(d.id) && !deletedDelKeys.includes(d.deliverable_name)));
        }
        return;
      }
      const { data, error } = await supabaseClient
        .from('custom_deliverables')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch error for custom_deliverables (fallback active):', error.message);
        const saved = localStorage.getItem('erp_custom_deliverables_data');
        if (saved) {
          const parsed = JSON.parse(saved);
          setDeliverables(parsed.filter((d: any) => !deletedDelKeys.includes(d.id) && !deletedDelKeys.includes(d.deliverable_name)));
        } else {
          setDeliverables(defaultDeliverables.filter(d => !deletedDelKeys.includes(d.id) && !deletedDelKeys.includes(d.deliverable_name)));
        }
      } else if (data) {
        const validDeliverables = data.filter(d => !deletedDelKeys.includes(d.id) && !deletedDelKeys.includes(d.deliverable_name));
        setDeliverables(validDeliverables);
        localStorage.setItem('erp_custom_deliverables_data', JSON.stringify(validDeliverables));
      }
    } catch (e: any) {
      console.error('Error in fetchDeliverables:', e);
      const saved = localStorage.getItem('erp_custom_deliverables_data');
      if (saved) setDeliverables(JSON.parse(saved));
    }
  }, [defaultDeliverables]);

  // Refresh All Master Data
  const loadMasterData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchRoles(), fetchDeliverables()]);
    setIsLoading(false);
  }, [fetchRoles, fetchDeliverables]);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadMasterData();
    setTimeout(() => {
      setIsRefreshing(false);
      showToast('Master lists refreshed successfully!');
    }, 400);
  };

  // Reusable sales text normalization helper to safely handle strings, arrays, objects, nulls, etc.
  const normalizeSalesText = (value: any): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.name || item.role || item.text || item.title || JSON.stringify(item);
        }
        return String(item || '');
      }).join(' ');
    }
    if (value && typeof value === 'object') {
      return value.name || value.role || value.text || value.title || JSON.stringify(value);
    }
    if (value == null) return '';
    return String(value);
  };

  // Helper to check if a Role is used in any package / lead / order / staff assignment
  const isRoleInUse = (roleNameToCheck: string): boolean => {
    if (!roleNameToCheck) return false;
    const searchTarget = roleNameToCheck.trim().toLowerCase();

    // Check packages
    for (const pkg of packages || []) {
      const tm = normalizeSalesText(pkg.team_members).toLowerCase();
      if (tm.includes(searchTarget)) return true;
    }

    // Check leads
    for (const lead of leads || []) {
      const tm = normalizeSalesText(lead.Team_Members || lead.team_members).toLowerCase();
      if (tm.includes(searchTarget)) return true;
      if (lead.events && Array.isArray(lead.events)) {
        for (const ev of lead.events) {
          const evTm = (
            normalizeSalesText((ev as any).team_members) + ' ' +
            normalizeSalesText((ev as any).assigned_staff_names) + ' ' +
            normalizeSalesText((ev as any).roles)
          ).toLowerCase();
          if (evTm.includes(searchTarget)) return true;
        }
      }
    }

    // Check lead packages
    for (const lp of leadPackages || []) {
      const tm = normalizeSalesText(lp.team_members).toLowerCase();
      if (tm.includes(searchTarget)) return true;
    }

    // Check orders
    for (const ord of orders || []) {
      const tm = (
        normalizeSalesText((ord as any).team_members) + ' ' +
        normalizeSalesText((ord as any).Team_Members) + ' ' +
        normalizeSalesText((ord as any).assigned_staff_names) + ' ' +
        normalizeSalesText((ord as any).roles)
      ).toLowerCase();
      if (tm.includes(searchTarget)) return true;
    }

    // Check staff assignments
    for (const sa of staffAssignments || []) {
      const role = (sa.staff_role || '').toLowerCase();
      if (role === searchTarget || role.includes(searchTarget)) return true;
    }

    return false;
  };

  // Helper to check if a Deliverable is used in any package / lead / order
  const isDeliverableInUse = (deliverableNameToCheck: string): boolean => {
    if (!deliverableNameToCheck) return false;
    const searchTarget = deliverableNameToCheck.trim().toLowerCase();

    // Check packages
    for (const pkg of packages || []) {
      const del = (pkg.deliverables || '').toLowerCase();
      if (del.includes(searchTarget)) return true;
    }

    // Check leads
    for (const lead of leads || []) {
      const del = (lead.deliverables_description || '').toLowerCase();
      if (del.includes(searchTarget)) return true;
    }

    // Check lead packages
    for (const lp of leadPackages || []) {
      const del = (lp.deliverables_description || '').toLowerCase();
      if (del.includes(searchTarget)) return true;
    }

    // Check orders
    for (const ord of orders || []) {
      const del = ((ord as any).deliverables_description || (ord as any).deliverables || '').toLowerCase();
      if (del.includes(searchTarget)) return true;
    }

    return false;
  };

  // --- ROLE ACTIONS ---

  const handleOpenAddRole = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setRoleError('');
    setShowRoleModal(true);
    setTimeout(() => {
      document.getElementById('role-modal-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleOpenEditRole = (role: CustomRole) => {
    setEditingRole(role);
    setRoleName(role.role_name);
    setRoleDescription(role.description || '');
    setRoleError('');
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleError('');

    const trimmedName = roleName.trim();
    if (!trimmedName) {
      setRoleError('Role Name is required.');
      return;
    }

    // Duplicate validation (case-insensitive)
    const isDuplicate = roles.some(r => 
      r.role_name.trim().toLowerCase() === trimmedName.toLowerCase() && 
      r.id !== editingRole?.id
    );

    if (isDuplicate) {
      setRoleError(`A Custom Role with the name "${trimmedName}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        role_name: trimmedName,
        description: roleDescription.trim() || null,
        status: editingRole ? editingRole.status : 'Active',
        updated_at: new Date().toISOString()
      };

      if (editingRole) {
        // Update existing role
        if (supabaseClient) {
          const { error } = await supabaseClient
            .from('custom_roles')
            .update(payload)
            .eq('id', editingRole.id);
          if (error && error.code !== '42P01') {
            console.warn('Supabase update role error:', error.message);
          }
        }
        
        // Local state update
        const updatedList = roles.map(r => r.id === editingRole.id ? { ...r, ...payload } : r);
        setRoles(updatedList);
        localStorage.setItem('erp_custom_roles_data', JSON.stringify(updatedList));
        showToast(`Role "${trimmedName}" updated successfully!`);
      } else {
        // Insert new role
        const newId = 'cr-' + Math.random().toString(36).substring(2, 9);
        const newRoleRecord: CustomRole = {
          id: newId,
          ...payload,
          created_at: new Date().toISOString()
        };

        if (supabaseClient) {
          const { data: insData, error } = await supabaseClient
            .from('custom_roles')
            .insert([{ role_name: payload.role_name, description: payload.description, status: payload.status }])
            .select();
          
          if (!error && insData && insData[0]) {
            newRoleRecord.id = insData[0].id;
          }
        }

        const updatedList = [newRoleRecord, ...roles];
        setRoles(updatedList);
        localStorage.setItem('erp_custom_roles_data', JSON.stringify(updatedList));
        showToast(`New Custom Role "${trimmedName}" created successfully!`);
      }

      setShowRoleModal(false);
      fetchRoles();
    } catch (err: any) {
      console.error('Failed to save Custom Role:', err);
      setRoleError(`Save failed: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleRoleStatus = async (role: CustomRole) => {
    const newStatus: 'Active' | 'Inactive' = role.status === 'Active' ? 'Inactive' : 'Active';
    try {
      if (supabaseClient) {
        await supabaseClient
          .from('custom_roles')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', role.id);
      }
      const updatedList = roles.map(r => r.id === role.id ? { ...r, status: newStatus } : r);
      setRoles(updatedList);
      localStorage.setItem('erp_custom_roles_data', JSON.stringify(updatedList));
      showToast(`Role "${role.role_name}" is now ${newStatus}.`);
    } catch (e: any) {
      showToast(`Failed to update status: ${e.message || e}`, 'error');
    }
  };

  const handleDeleteRole = (role: CustomRole) => {
    // Check if role is in use
    if (isRoleInUse(role.role_name)) {
      showToast(
        'This role is currently in use and cannot be deleted.',
        'error'
      );
      setInUseRoleModal(role);
      return;
    }

    // Trigger confirmation modal
    setRoleToDelete(role);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    const role = roleToDelete;

    setDeletingRoleId(role.id);
    try {
      let errorMsg = '';

      // 1. Perform persistent delete from Supabase using the UNIQUE role ID
      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('custom_roles')
          .delete()
          .eq('id', role.id);
        if (error && error.code !== '42P01') {
          console.warn('Supabase delete custom_roles error:', error.message);
          errorMsg = error.message;
        }
      }

      if (pushDelete && (!supabaseClient || errorMsg)) {
        const res = await pushDelete('custom_roles', 'id', role.id);
        if (res.success) {
          errorMsg = '';
        } else if (!errorMsg) {
          errorMsg = res.error || 'Database delete failed';
        }
      }

      if (errorMsg) {
        throw new Error(errorMsg);
      }

      // 2. Persist in deleted tracking in localStorage using unique ID
      try {
        const delKey = 'erp_deleted_custom_role_ids';
        const existing = localStorage.getItem(delKey);
        const list: string[] = existing ? JSON.parse(existing) : [];
        if (!list.includes(role.id)) list.push(role.id);
        localStorage.setItem(delKey, JSON.stringify(list));
      } catch (_) {}

      // 3. Immediately update UI state by filtering out the UNIQUE role ID
      const updatedList = roles.filter(r => r.id !== role.id);
      setRoles(updatedList);
      localStorage.setItem('erp_custom_roles_data', JSON.stringify(updatedList));

      // 4. Close modal & show success toast
      setRoleToDelete(null);
      showToast('Role deleted successfully.', 'success');
    } catch (e: any) {
      console.error('Failed to delete role:', e);
      showToast(`Failed to delete role: ${e.message || e}`, 'error');
    } finally {
      setDeletingRoleId(null);
    }
  };

  // --- DELIVERABLE ACTIONS ---

  const handleOpenAddDeliverable = () => {
    setEditingDeliverable(null);
    setDeliverableName('');
    setDeliverableDescription('');
    setDeliverableError('');
    setShowDeliverableModal(true);
    setTimeout(() => {
      document.getElementById('deliverable-modal-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleOpenEditDeliverable = (deliverable: CustomDeliverable) => {
    setEditingDeliverable(deliverable);
    setDeliverableName(deliverable.deliverable_name);
    setDeliverableDescription(deliverable.description || '');
    setDeliverableError('');
    setShowDeliverableModal(true);
  };

  const handleSaveDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeliverableError('');

    const trimmedName = deliverableName.trim();
    if (!trimmedName) {
      setDeliverableError('Deliverable Name is required.');
      return;
    }

    // Duplicate validation (case-insensitive)
    const isDuplicate = deliverables.some(d => 
      d.deliverable_name.trim().toLowerCase() === trimmedName.toLowerCase() && 
      d.id !== editingDeliverable?.id
    );

    if (isDuplicate) {
      setDeliverableError(`A Custom Deliverable with the name "${trimmedName}" already exists.`);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        deliverable_name: trimmedName,
        description: deliverableDescription.trim() || null,
        status: editingDeliverable ? editingDeliverable.status : 'Active',
        updated_at: new Date().toISOString()
      };

      if (editingDeliverable) {
        // Update existing deliverable
        if (supabaseClient) {
          const { error } = await supabaseClient
            .from('custom_deliverables')
            .update(payload)
            .eq('id', editingDeliverable.id);
          if (error && error.code !== '42P01') {
            console.warn('Supabase update deliverable error:', error.message);
          }
        }
        
        const updatedList = deliverables.map(d => d.id === editingDeliverable.id ? { ...d, ...payload } : d);
        setDeliverables(updatedList);
        localStorage.setItem('erp_custom_deliverables_data', JSON.stringify(updatedList));
        showToast(`Deliverable "${trimmedName}" updated successfully!`);
      } else {
        // Insert new deliverable
        const newId = 'cd-' + Math.random().toString(36).substring(2, 9);
        const newDeliverableRecord: CustomDeliverable = {
          id: newId,
          ...payload,
          created_at: new Date().toISOString()
        };

        if (supabaseClient) {
          const { data: insData, error } = await supabaseClient
            .from('custom_deliverables')
            .insert([{ deliverable_name: payload.deliverable_name, description: payload.description, status: payload.status }])
            .select();
          
          if (!error && insData && insData[0]) {
            newDeliverableRecord.id = insData[0].id;
          }
        }

        const updatedList = [newDeliverableRecord, ...deliverables];
        setDeliverables(updatedList);
        localStorage.setItem('erp_custom_deliverables_data', JSON.stringify(updatedList));
        showToast(`New Custom Deliverable "${trimmedName}" created successfully!`);
      }

      setShowDeliverableModal(false);
      fetchDeliverables();
    } catch (err: any) {
      console.error('Failed to save Custom Deliverable:', err);
      setDeliverableError(`Save failed: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDeliverableStatus = async (deliverable: CustomDeliverable) => {
    const newStatus: 'Active' | 'Inactive' = deliverable.status === 'Active' ? 'Inactive' : 'Active';
    try {
      if (supabaseClient) {
        await supabaseClient
          .from('custom_deliverables')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', deliverable.id);
      }
      const updatedList = deliverables.map(d => d.id === deliverable.id ? { ...d, status: newStatus } : d);
      setDeliverables(updatedList);
      localStorage.setItem('erp_custom_deliverables_data', JSON.stringify(updatedList));
      showToast(`Deliverable "${deliverable.deliverable_name}" is now ${newStatus}.`);
    } catch (e: any) {
      showToast(`Failed to update status: ${e.message || e}`, 'error');
    }
  };

  const handleDeleteDeliverable = (deliverable: CustomDeliverable) => {
    // Check if deliverable is in use
    if (isDeliverableInUse(deliverable.deliverable_name)) {
      showToast(
        'This deliverable is currently in use and cannot be deleted.',
        'error'
      );
      setInUseDeliverableModal(deliverable);
      return;
    }

    // Trigger confirmation modal
    setDeliverableToDelete(deliverable);
  };

  const confirmDeleteDeliverable = async () => {
    if (!deliverableToDelete) return;
    const deliverable = deliverableToDelete;

    setDeletingDeliverableId(deliverable.id);
    try {
      let errorMsg = '';

      // 1. Perform persistent delete from Supabase using UNIQUE deliverable ID
      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('custom_deliverables')
          .delete()
          .eq('id', deliverable.id);
        if (error && error.code !== '42P01') {
          console.warn('Supabase delete custom_deliverables error:', error.message);
          errorMsg = error.message;
        }
      }

      if (pushDelete && (!supabaseClient || errorMsg)) {
        const res = await pushDelete('custom_deliverables', 'id', deliverable.id);
        if (res.success) {
          errorMsg = '';
        } else if (!errorMsg) {
          errorMsg = res.error || 'Database delete failed';
        }
      }

      if (errorMsg) {
        throw new Error(errorMsg);
      }

      // 2. Persist in deleted tracking in localStorage using unique ID
      try {
        const delKey = 'erp_deleted_custom_deliverable_ids';
        const existing = localStorage.getItem(delKey);
        const list: string[] = existing ? JSON.parse(existing) : [];
        if (!list.includes(deliverable.id)) list.push(deliverable.id);
        localStorage.setItem(delKey, JSON.stringify(list));
      } catch (_) {}

      // 3. Immediately update UI state by filtering out the UNIQUE deliverable ID
      const updatedList = deliverables.filter(d => d.id !== deliverable.id);
      setDeliverables(updatedList);
      localStorage.setItem('erp_custom_deliverables_data', JSON.stringify(updatedList));

      // 4. Close modal & show success toast
      setDeliverableToDelete(null);
      showToast('Deliverable deleted successfully.', 'success');
    } catch (e: any) {
      console.error('Failed to delete deliverable:', e);
      showToast(`Failed to delete deliverable: ${e.message || e}`, 'error');
    } finally {
      setDeletingDeliverableId(null);
    }
  };

  // Filtered lists for rendering
  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) return roles;
    const q = searchQuery.toLowerCase();
    return roles.filter(r => 
      r.role_name.toLowerCase().includes(q) || 
      (r.description && r.description.toLowerCase().includes(q))
    );
  }, [roles, searchQuery]);

  const filteredDeliverables = useMemo(() => {
    if (!searchQuery.trim()) return deliverables;
    const q = searchQuery.toLowerCase();
    return deliverables.filter(d => 
      d.deliverable_name.toLowerCase().includes(q) || 
      (d.description && d.description.toLowerCase().includes(q))
    );
  }, [deliverables, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 font-sans pb-12">

      {/* Floating Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200 ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40' 
            : 'bg-rose-950/90 text-rose-200 border-rose-500/40'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
          )}
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}

      {/* Module Header */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-850 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="hidden items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Layers className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono font-bold tracking-widest text-amber-500 uppercase">
                Studio Master Configuration
              </span>
            </div>
            <h2 className="hidden text-xl sm:text-2xl font-black text-white tracking-tight">
              Custom Package Master
            </h2>
            <p className="hidden text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Manage custom staff roles and deliverable master items. Active roles and deliverables automatically populate Step 3 quotation package dropdowns across all deals.
            </p>
          </div>

          {/* Header Action Bar Hidden per requirements */}
        </div>

        {/* Filter and View Toggles Bar */}
        <div className="mt-6 pt-4 border-t border-zinc-850 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-850 w-full sm:w-auto overflow-x-auto whitespace-nowrap scrollbar-none">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Masters ({roles.length + deliverables.length})
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'roles'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>Roles ({roles.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('deliverables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'deliverables'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              <span>Deliverables ({deliverables.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search roles or deliverables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono placeholder:text-zinc-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-zinc-900/50 border border-zinc-850 rounded-2xl p-12 text-center">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-xs text-zinc-400 font-mono">Loading Custom Package Masters from Supabase...</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* SECTION 1: CUSTOM ROLES */}
          {(activeTab === 'all' || activeTab === 'roles') && (
            <div className="bg-zinc-900 border border-zinc-850 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono flex items-center gap-2">
                      <span>Custom Roles</span>
                      <span className="text-[10px] font-normal text-zinc-500 lowercase bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                        {filteredRoles.length} items
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Configured crew designations loaded dynamically into Step 3 Team Members Included.
                    </p>
                  </div>
                </div>

                {activeTab === 'roles' && (
                  <button
                    onClick={handleOpenAddRole}
                    className="w-full sm:w-auto justify-center px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 transition-all text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom Role</span>
                  </button>
                )}
              </div>

              {filteredRoles.length === 0 ? (
                <div className="bg-zinc-950/60 border border-dashed border-zinc-800 rounded-xl p-8 text-center">
                  <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400 font-medium">No custom roles found.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Click "+ Add Custom Role" to create your first role designation.</p>
                </div>
              ) : (
                <>
                  {/* Mobile-friendly stacked card layout for small screens */}
                  <div className="block md:hidden space-y-3">
                    {filteredRoles.map((role) => {
                      const used = isRoleInUse(role.role_name);
                      return (
                        <div key={role.id} className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                <span className="font-bold text-zinc-100 text-xs">{role.role_name}</span>
                                {used && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded border border-zinc-700" title="Used in active packages or leads">
                                    In Use
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-405 leading-relaxed">
                                {role.description || <span className="italic text-zinc-600">No description</span>}
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              {role.status === 'Active' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  <XCircle className="w-3 h-3" />
                                  Inactive
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-[10px] text-zinc-500 font-mono flex justify-between items-center border-t border-zinc-850/50 pt-2">
                            <span>Created: {role.created_at ? formatDateDDMMYY(role.created_at) : 'N/A'}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-850/50">
                            <button
                              onClick={() => handleOpenEditRole(role)}
                              className="flex-1 min-w-[70px] px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white transition-all text-xs font-mono font-medium flex items-center justify-center gap-1 cursor-pointer"
                              title="Edit Role"
                            >
                              <Edit className="w-3 h-3 text-amber-400" />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => handleToggleRoleStatus(role)}
                              className={`flex-1 min-w-[90px] px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer text-center ${
                                role.status === 'Active'
                                  ? 'bg-zinc-800 hover:bg-amber-950/40 text-amber-400 hover:text-amber-300 border border-amber-500/20'
                                  : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30'
                              }`}
                              title={role.status === 'Active' ? 'Deactivate Role' : 'Activate Role'}
                            >
                              {role.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </button>

                            <button
                              onClick={() => handleDeleteRole(role)}
                              disabled={deletingRoleId === role.id}
                              className={`p-1.5 rounded-lg text-rose-400 transition-all cursor-pointer border border-zinc-850 bg-zinc-900 ${
                                deletingRoleId === role.id ? 'opacity-50 cursor-wait' :
                                used 
                                  ? 'opacity-40 hover:opacity-100 hover:bg-rose-500/10' 
                                  : 'hover:bg-rose-500/15 hover:text-rose-300'
                              }`}
                              title={used ? "Role is used in packages/leads (Click to view warning)" : "Delete Role"}
                            >
                              {deletingRoleId === role.id ? (
                                <RefreshCw className="w-3.5 h-3.5 mx-auto animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop view table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-850">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-950/80 text-zinc-400 font-mono uppercase text-[10px] tracking-wider border-b border-zinc-850">
                          <th className="py-3 px-4">Role Name</th>
                          <th className="hidden py-3 px-4">Description</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Created Date</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850/60 font-sans">
                        {filteredRoles.map((role) => {
                          const used = isRoleInUse(role.role_name);
                          return (
                            <tr key={role.id} className="hover:bg-zinc-850/40 transition-colors group">
                              <td className="py-3 px-4 font-bold text-zinc-100 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                                <span>{role.role_name}</span>
                                {used && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded border border-zinc-700" title="Used in active packages or leads">
                                    In Use
                                  </span>
                                )}
                              </td>
                              <td className="hidden py-3 px-4 text-zinc-400 max-w-xs truncate">
                                {role.description || <span className="italic text-zinc-600 text-[11px]">No description</span>}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {role.status === 'Active' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                    <XCircle className="w-3 h-3" />
                                    Inactive
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-zinc-500">
                                {role.created_at ? formatDateDDMMYY(role.created_at) : 'N/A'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditRole(role)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white transition-all text-[11px] font-mono font-medium flex items-center gap-1 cursor-pointer"
                                    title="Edit Role"
                                  >
                                    <Edit className="w-3 h-3 text-amber-400" />
                                    <span>Edit</span>
                                  </button>

                                  <button
                                    onClick={() => handleToggleRoleStatus(role)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${
                                      role.status === 'Active'
                                        ? 'bg-zinc-800 hover:bg-amber-950/40 text-amber-400 hover:text-amber-300 border border-amber-500/20'
                                        : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30'
                                    }`}
                                    title={role.status === 'Active' ? 'Deactivate Role' : 'Activate Role'}
                                  >
                                    {role.status === 'Active' ? 'Deactivate' : 'Activate'}
                                  </button>

                                  <button
                                    onClick={() => handleDeleteRole(role)}
                                    disabled={deletingRoleId === role.id}
                                    className={`p-1.5 rounded-lg text-rose-400 transition-all cursor-pointer ${
                                      deletingRoleId === role.id ? 'opacity-50 cursor-wait' :
                                      used 
                                        ? 'opacity-40 hover:opacity-100 hover:bg-rose-500/10' 
                                        : 'hover:bg-rose-500/15 hover:text-rose-300'
                                    }`}
                                    title={used ? "Role is used in packages/leads (Click to view warning)" : "Delete Role"}
                                  >
                                    {deletingRoleId === role.id ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SECTION 2: CUSTOM DELIVERABLES */}
          {(activeTab === 'all' || activeTab === 'deliverables') && (
            <div className="bg-zinc-900 border border-zinc-850 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wide font-mono flex items-center gap-2">
                      <span>Custom Deliverables</span>
                      <span className="text-[10px] font-normal text-zinc-500 lowercase bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                        {filteredDeliverables.length} items
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Standardized album, video, and physical deliverables loaded into Step 3 quotation options.
                    </p>
                  </div>
                </div>

                {activeTab === 'deliverables' && (
                  <button
                    onClick={handleOpenAddDeliverable}
                    className="w-full sm:w-auto justify-center px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 transition-all text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Custom Deliverable</span>
                  </button>
                )}
              </div>

              {filteredDeliverables.length === 0 ? (
                <div className="bg-zinc-950/60 border border-dashed border-zinc-800 rounded-xl p-8 text-center">
                  <Package className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400 font-medium">No custom deliverables found.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Click "+ Add Custom Deliverable" to add your first master deliverable item.</p>
                </div>
              ) : (
                <>
                  {/* Mobile-friendly stacked card layout for small screens */}
                  <div className="block md:hidden space-y-3">
                    {filteredDeliverables.map((del) => {
                      const used = isDeliverableInUse(del.deliverable_name);
                      return (
                        <div key={del.id} className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                <span className="font-bold text-zinc-100 text-xs">{del.deliverable_name}</span>
                                {used && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded border border-zinc-700" title="Used in active packages or leads">
                                    In Use
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-405 leading-relaxed">
                                {del.description || <span className="italic text-zinc-600">No description</span>}
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              {del.status === 'Active' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Active
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  <XCircle className="w-3 h-3" />
                                  Inactive
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-[10px] text-zinc-500 font-mono flex justify-between items-center border-t border-zinc-850/50 pt-2">
                            <span>Created: {del.created_at ? formatDateDDMMYY(del.created_at) : 'N/A'}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-850/50">
                            <button
                              onClick={() => handleOpenEditDeliverable(del)}
                              className="flex-1 min-w-[70px] px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white transition-all text-xs font-mono font-medium flex items-center justify-center gap-1 cursor-pointer"
                              title="Edit Deliverable"
                            >
                              <Edit className="w-3 h-3 text-emerald-400" />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => handleToggleDeliverableStatus(del)}
                              className={`flex-1 min-w-[90px] px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer text-center ${
                                del.status === 'Active'
                                  ? 'bg-zinc-800 hover:bg-amber-950/40 text-amber-400 hover:text-amber-300 border border-amber-500/20'
                                  : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30'
                              }`}
                              title={del.status === 'Active' ? 'Deactivate Deliverable' : 'Activate Deliverable'}
                            >
                              {del.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </button>

                            <button
                              onClick={() => handleDeleteDeliverable(del)}
                              disabled={deletingDeliverableId === del.id}
                              className={`p-1.5 rounded-lg text-rose-400 transition-all cursor-pointer border border-zinc-850 bg-zinc-900 ${
                                deletingDeliverableId === del.id ? 'opacity-50 cursor-wait' :
                                used 
                                  ? 'opacity-40 hover:opacity-100 hover:bg-rose-500/10' 
                                  : 'hover:bg-rose-500/15 hover:text-rose-300'
                              }`}
                              title={used ? "Deliverable is used in packages/leads (Click to view warning)" : "Delete Deliverable"}
                            >
                              {deletingDeliverableId === del.id ? (
                                <RefreshCw className="w-3.5 h-3.5 mx-auto animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop view table */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-850">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-950/80 text-zinc-400 font-mono uppercase text-[10px] tracking-wider border-b border-zinc-850">
                          <th className="py-3 px-4">Deliverable Name</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Created Date</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-850/60 font-sans">
                        {filteredDeliverables.map((del) => {
                          const used = isDeliverableInUse(del.deliverable_name);
                          return (
                            <tr key={del.id} className="hover:bg-zinc-850/40 transition-colors group">
                              <td className="py-3 px-4 font-bold text-zinc-100 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                <span>{del.deliverable_name}</span>
                                {used && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded border border-zinc-700" title="Used in active packages or leads">
                                    In Use
                                  </span>
                                )}
                              </td>
                              <td className="hidden py-3 px-4 text-zinc-400 max-w-xs truncate">
                                {del.description || <span className="italic text-zinc-600 text-[11px]">No description</span>}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {del.status === 'Active' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                    <XCircle className="w-3 h-3" />
                                    Inactive
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-[11px] text-zinc-500">
                                {del.created_at ? formatDateDDMMYY(del.created_at) : 'N/A'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenEditDeliverable(del)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white transition-all text-[11px] font-mono font-medium flex items-center gap-1 cursor-pointer"
                                    title="Edit Deliverable"
                                  >
                                    <Edit className="w-3 h-3 text-emerald-400" />
                                    <span>Edit</span>
                                  </button>

                                  <button
                                    onClick={() => handleToggleDeliverableStatus(del)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer ${
                                      del.status === 'Active'
                                        ? 'bg-zinc-800 hover:bg-amber-950/40 text-amber-400 hover:text-amber-300 border border-amber-500/20'
                                        : 'bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-500/30'
                                    }`}
                                    title={del.status === 'Active' ? 'Deactivate Deliverable' : 'Activate Deliverable'}
                                  >
                                    {del.status === 'Active' ? 'Deactivate' : 'Activate'}
                                  </button>

                                  <button
                                    onClick={() => handleDeleteDeliverable(del)}
                                    disabled={deletingDeliverableId === del.id}
                                    className={`p-1.5 rounded-lg text-rose-400 transition-all cursor-pointer ${
                                      deletingDeliverableId === del.id ? 'opacity-50 cursor-wait' :
                                      used 
                                        ? 'opacity-40 hover:opacity-100 hover:bg-rose-500/10' 
                                        : 'hover:bg-rose-500/15 hover:text-rose-300'
                                    }`}
                                    title={used ? "Deliverable is used in packages/leads (Click to view warning)" : "Delete Deliverable"}
                                  >
                                    {deletingDeliverableId === del.id ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      )}

      {/* MODAL: ADD / EDIT ROLE */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="role-modal-container" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                  {editingRole ? 'Edit Custom Role' : '+ Add Custom Role'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleModal(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {roleError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{roleError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRole} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-mono uppercase font-bold text-zinc-300 mb-1.5">
                  Role Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lead Photographer, Drone Operator"
                  value={roleName}
                  onChange={(e) => {
                    setRoleName(e.target.value);
                    if (roleError) setRoleError('');
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 focus:outline-none rounded-xl py-2 px-3 text-xs text-white placeholder:text-zinc-600 font-sans"
                />
              </div>

              <div className="hidden">
                <label className="block text-xs font-mono uppercase font-bold text-zinc-300 mb-1.5">
                  Description <span className="text-zinc-500 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide scope guidelines for this crew role..."
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 focus:outline-none rounded-xl py-2 px-3 text-xs text-white placeholder:text-zinc-600 font-sans resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-mono font-bold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Save Role</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT DELIVERABLE */}
      {showDeliverableModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="deliverable-modal-container" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Package className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                  {editingDeliverable ? 'Edit Custom Deliverable' : '+ Add Custom Deliverable'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliverableModal(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deliverableError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{deliverableError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDeliverable} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-mono uppercase font-bold text-zinc-300 mb-1.5">
                  Deliverable Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Photobook Album (30 Pages), Teaser Video"
                  value={deliverableName}
                  onChange={(e) => {
                    setDeliverableName(e.target.value);
                    if (deliverableError) setDeliverableError('');
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none rounded-xl py-2 px-3 text-xs text-white placeholder:text-zinc-600 font-sans"
                />
              </div>

              <div className="hidden">
                <label className="block text-xs font-mono uppercase font-bold text-zinc-300 mb-1.5">
                  Description <span className="text-zinc-500 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide specs or output format..."
                  value={deliverableDescription}
                  onChange={(e) => setDeliverableDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:outline-none rounded-xl py-2 px-3 text-xs text-white placeholder:text-zinc-600 font-sans resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => setShowDeliverableModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-mono font-bold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Save Deliverable</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE ROLE */}
      {roleToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="delete-role-modal" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                    Delete Custom Role
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    Confirm permanent deletion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-left">
              <p className="text-xs text-zinc-300 font-sans">
                Are you sure you want to delete this role?
              </p>
              <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-850 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-zinc-100 block truncate">
                    {roleToDelete.role_name}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    ID: {roleToDelete.id}
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  roleToDelete.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  {roleToDelete.status}
                </span>
              </div>
              <p className="text-[11px] text-rose-400/90 font-sans">
                This action cannot be undone. The role will be permanently removed from custom roles.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-850">
              <button
                type="button"
                onClick={() => setRoleToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-mono font-bold cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteRole}
                disabled={deletingRoleId === roleToDelete.id}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
              >
                {deletingRoleId === roleToDelete.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IN-USE ROLE WARNING */}
      {inUseRoleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="in-use-role-modal" className="bg-zinc-900 border border-amber-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                    Role In Use
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    Protected from deletion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInUseRoleModal(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-left">
              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                This role is currently in use and cannot be deleted.
              </p>
              <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-850 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-zinc-100 block truncate">
                    {inUseRoleModal.role_name}
                  </span>
                  <span className="text-[10px] text-amber-400/80 font-mono">
                    Referenced in active packages, leads, or orders
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                To preserve project and quote data integrity, active roles in use cannot be deleted. You can <strong className="text-zinc-200">Deactivate</strong> this role to hide it from new quotations.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-850">
              <button
                type="button"
                onClick={() => setInUseRoleModal(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-mono font-bold cursor-pointer transition-all"
              >
                Close
              </button>
              {inUseRoleModal.status === 'Active' && (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleRoleStatus(inUseRoleModal);
                    setInUseRoleModal(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-bold cursor-pointer transition-all"
                >
                  Deactivate Role
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE DELIVERABLE */}
      {deliverableToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="delete-deliverable-modal" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                    Delete Custom Deliverable
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    Confirm permanent deletion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeliverableToDelete(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-left">
              <p className="text-xs text-zinc-300 font-sans">
                Are you sure you want to delete this deliverable?
              </p>
              <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-850 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-zinc-100 block truncate">
                    {deliverableToDelete.deliverable_name}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    ID: {deliverableToDelete.id}
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  deliverableToDelete.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  {deliverableToDelete.status}
                </span>
              </div>
              <p className="text-[11px] text-rose-400/90 font-sans">
                This action cannot be undone. The deliverable will be permanently removed from custom deliverables.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-850">
              <button
                type="button"
                onClick={() => setDeliverableToDelete(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-mono font-bold cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteDeliverable}
                disabled={deletingDeliverableId === deliverableToDelete.id}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
              >
                {deletingDeliverableId === deliverableToDelete.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IN-USE DELIVERABLE WARNING */}
      {inUseDeliverableModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div id="in-use-deliverable-modal" className="bg-zinc-900 border border-emerald-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wide font-mono">
                    Deliverable In Use
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-sans">
                    Protected from deletion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInUseDeliverableModal(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-left">
              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                This deliverable is currently in use and cannot be deleted.
              </p>
              <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-850 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-zinc-100 block truncate">
                    {inUseDeliverableModal.deliverable_name}
                  </span>
                  <span className="text-[10px] text-emerald-400/80 font-mono">
                    Referenced in active packages, leads, or orders
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                To preserve package and quote data integrity, active deliverables in use cannot be deleted. You can <strong className="text-zinc-200">Deactivate</strong> this deliverable to hide it from new quotations.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-850">
              <button
                type="button"
                onClick={() => setInUseDeliverableModal(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-mono font-bold cursor-pointer transition-all"
              >
                Close
              </button>
              {inUseDeliverableModal.status === 'Active' && (
                <button
                  type="button"
                  onClick={() => {
                    handleToggleDeliverableStatus(inUseDeliverableModal);
                    setInUseDeliverableModal(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-bold cursor-pointer transition-all"
                >
                  Deactivate Deliverable
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
