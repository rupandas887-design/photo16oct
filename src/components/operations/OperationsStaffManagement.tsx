import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRole, getStaffCurrentPassword, fetchStaffCurrentPassword } from '../RoleContext';
import { 
  Users, UserCheck, ShieldAlert, PlusCircle, Edit, Mail, Phone, Calendar, Briefcase, Search, X,
  ChevronDown, Sparkles, Eye, EyeOff
} from 'lucide-react';
import { Staff } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@supabase/supabase-js';
import { supabaseClient } from '../../supabaseClient';
import { checkGlobalStaffUniqueness, formatStaffErrorMessage, verifyStaffDatabaseUniqueness, cleanPhone, cleanEmail, scrollToFirstError } from '../../utils';
import { parseDateTimeToTimestamp } from '../ui/ListSortFilter';

export const OperationsStaffManagement: React.FC = () => {
  const { currentRole, staff, productionStaff = [], users = [], addStaff, updateStaff, operations, leads, orders, staffAssignments } = useRole();
  const canEdit = currentRole === 'Operations Team' || currentRole === 'Business Owner';

  // Modal / Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentStaffPassword, setCurrentStaffPassword] = useState('');
  const [openSkillsStaffId, setOpenSkillsStaffId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  // Automatically scroll modal viewport to error message whenever form validation fails
  useEffect(() => {
    if (formError || mobileError || emailError) {
      scrollToFirstError();
    }
  }, [formError, mobileError, emailError]);

  // Close skills dropdown on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest('.skills-dropdown-container')) {
        setOpenSkillsStaffId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenSkillsStaffId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Ensure current staff password remains in sync with users list
  useEffect(() => {
    if (editingId && showStaffModal) {
      const activeStaff = staff.find((s: any) => s.staff_id === editingId) || 
                          productionStaff.find((s: any) => s.staff_id === editingId);
      if (activeStaff) {
        const pwd = getStaffCurrentPassword(activeStaff, users);
        if (pwd) {
          setCurrentStaffPassword(pwd);
        } else {
          fetchStaffCurrentPassword(activeStaff, users).then(livePwd => {
            if (livePwd) setCurrentStaffPassword(livePwd);
          }).catch(() => {});
        }
      }
    }
  }, [editingId, showStaffModal, staff, productionStaff, users]);

  // Helper to extract staff-specific skills list
  const getStaffSkillsList = (st: Staff): string[] => {
    if (!st) return [];
    const rawSkill = st.Skill ?? (st as any).skills ?? (st as any).skill;
    if (Array.isArray(rawSkill)) {
      return rawSkill.map(s => String(s).trim()).filter(Boolean);
    }
    if (typeof rawSkill === 'string' && rawSkill.trim().length > 0) {
      const trimmed = rawSkill.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map(s => String(s).trim()).filter(Boolean);
          }
        } catch (e) {}
      }
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  };
  const [form, setForm] = useState({
    name: '',
    role: 'Photographer',
    email: '',
    mobile: '',
    whatsapp_number: '',
    department: 'Operations',
    status: 'Active' as Staff['status'],
    staff_type: 'In-House' as 'In-House' | 'Freelancer',
    joining_date: new Date().toISOString().split('T')[0],
    profile_photo: '',
    notes: '',
    password: ''
  });

  const [selectedStaffBookings, setSelectedStaffBookings] = useState<{ staffName: string; bookings: any[] } | null>(null);

  useEffect(() => {
    if (showStaffModal || selectedStaffBookings) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showStaffModal, selectedStaffBookings]);
  const [searchQuery, setSearchQuery] = useState('');
  const [operatingId, setOperatingId] = useState<string | null>(null);

  const handleSelectEdit = (st: any) => {
    setEditingId(st.staff_id);
    setShowStaffModal(true);
    setShowPassword(false);
    setFormError('');

    // Retrieve and show current password
    const pwd = getStaffCurrentPassword(st, users);
    setCurrentStaffPassword(pwd || '');
    if (!pwd) {
      fetchStaffCurrentPassword(st, users).then(livePwd => {
        if (livePwd) setCurrentStaffPassword(livePwd);
      }).catch(() => {});
    }

    setForm({
      name: st.name,
      role: st.role,
      email: st.email || '',
      mobile: st.mobile || '',
      whatsapp_number: st.whatsapp_number || '',
      department: st.department || 'Operations',
      status: st.status,
      staff_type: st.Staff_Type || st.staff_type || 'In-House',
      joining_date: st.joining_date || new Date().toISOString().split('T')[0],
      profile_photo: st.profile_photo || '',
      notes: st.notes || '',
      password: ''
    });

    const loadedSkills = typeof st.Skill === 'string'
      ? st.Skill.split(',').map((s: string) => s.trim()).filter(Boolean)
      : (Array.isArray(st.Skill) ? st.Skill : []);
    setSkills(loadedSkills);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowStaffModal(false);
    setShowPassword(false);
    setCurrentStaffPassword('');
    setFormError('');
    setForm({
      name: '',
      role: 'Photographer',
      email: '',
      mobile: '',
      whatsapp_number: '',
      department: 'Operations',
      status: 'Active',
      staff_type: 'In-House',
      joining_date: new Date().toISOString().split('T')[0],
      profile_photo: '',
      notes: '',
      password: ''
    });
    setSkills([]);
    setNewSkill('');
  };

  const handleAddSkill = async () => {
    const trimmed = newSkill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      const newSkills = [...skills, trimmed];
      setSkills(newSkills);
      setNewSkill('');
      
      if (editingId) {
        try {
          await updateStaff(editingId, { Skill: newSkills.join(', ') });
        } catch (e) {
          console.error("Failed to update skills in real-time:", e);
        }
      }
    }
  };

  const handleRemoveSkill = async (skillToRemove: string) => {
    const newSkills = skills.filter(s => s !== skillToRemove);
    setSkills(newSkills);
    
    if (editingId) {
      try {
        await updateStaff(editingId, { Skill: newSkills.join(', ') });
      } catch (e) {
        console.error("Failed to update skills in real-time:", e);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setMobileError('');
    setEmailError('');

    if (!form.name || !form.name.trim()) {
      setFormError('Please enter the staff member\'s full name.');
      return;
    }

    if (!form.mobile || !form.mobile.trim()) {
      setMobileError('Please enter a mobile number.');
      setFormError('Please enter a mobile number.');
      return;
    }

    const cleanMob = cleanPhone(form.mobile);
    if (!cleanMob || cleanMob.length < 10) {
      setMobileError('Please enter a valid 10-digit mobile number.');
      setFormError('Please enter a valid 10-digit mobile number.');
      return;
    }

    // Auto-generate email based on unique mobile or name
    const finalEmail = form.email?.trim() || `${cleanMob || form.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'staff'}@photocrew.com`;
    const finalSkillsStr = skills.join(', ');

    // Extract password out of submission payload for the staff table
    const { password, ...payloadWithoutPassword } = form;
    const cleanPwd = (password || '').trim();

    if (cleanPwd && cleanPwd.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    const finalPassword = cleanPwd || (!editingId ? `${cleanMob}@123` : '');

    const submissionPayload = {
      ...payloadWithoutPassword,
      name: form.name.trim(),
      mobile: cleanMob,
      email: finalEmail,
      Skill: finalSkillsStr,
      Staff_Type: form.staff_type
    };

    setIsSaving(true);
    try {
      let targetUserId = null;
      let originalMobile = null;
      let originalEmail = null;
      if (editingId) {
        const originalStaff = staff.find(s => s.staff_id === editingId) || productionStaff.find(s => s.staff_id === editingId);
        if (originalStaff) {
          originalMobile = originalStaff.mobile;
          originalEmail = originalStaff.email;
          const u = users.find((x: any) => 
            (originalStaff.email && x.email?.toLowerCase() === originalStaff.email.toLowerCase()) ||
            (originalStaff.mobile && x.mobile && String(x.mobile).replace(/\D/g, '') === String(originalStaff.mobile).replace(/\D/g, '')) ||
            (originalStaff.email && x.username?.toLowerCase() === originalStaff.email.toLowerCase())
          );
          if (u?.id) targetUserId = u.id;
        }
      }

      // Duplicate Check Validation against production_staff, users, operations_staff
      const uniquenessCheck = await verifyStaffDatabaseUniqueness(
        supabaseClient,
        cleanMob,
        form.email || (editingId ? undefined : finalEmail),
        editingId || null,
        targetUserId,
        originalMobile,
        originalEmail
      );

      if (uniquenessCheck.queryFailed) {
        setFormError(uniquenessCheck.error || "Database query failed while checking staff uniqueness.");
        setIsSaving(false);
        return;
      }

      if (!uniquenessCheck.isUnique) {
        if (uniquenessCheck.isMobileDuplicate && uniquenessCheck.isEmailDuplicate) {
          setMobileError("This mobile number is already registered.");
          setEmailError("This email address is already registered.");
          setFormError("This mobile number is already registered. This email address is already registered.");
        } else if (uniquenessCheck.isMobileDuplicate) {
          setMobileError("This mobile number is already registered.");
          setFormError("This mobile number is already registered.");
        } else if (uniquenessCheck.isEmailDuplicate) {
          setEmailError("This email address is already registered.");
          setFormError("This email address is already registered.");
        } else {
          setFormError(uniquenessCheck.error || "Registration validation failed.");
        }
        setIsSaving(false);
        return;
      }

      if (editingId) {
        const originalStaff = staff.find(s => s.staff_id === editingId) || productionStaff.find(s => s.staff_id === editingId);
        const targetEmail = originalStaff?.email || form.email || finalEmail;

        if (!targetUserId && users && users.length > 0) {
          const u = users.find((x: any) => 
            (originalStaff?.email && x.email?.toLowerCase() === originalStaff.email.toLowerCase()) ||
            (originalStaff?.mobile && x.mobile && String(x.mobile).replace(/\D/g, '') === String(originalStaff.mobile).replace(/\D/g, ''))
          );
          if (u?.id) targetUserId = u.id;
        }

        if (cleanPwd) {
          // Update Supabase Auth via secure endpoint
          try {
            const authRes = await fetch('/api/auth/update-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auth_id: targetUserId,
                staff_id: editingId,
                email: targetEmail,
                mobile: originalStaff?.mobile || cleanMob,
                password: cleanPwd,
                name: form.name.trim(),
                role: 'Operation Staff'
              })
            });
            if (!authRes.ok) {
              const errData = await authRes.json().catch(() => ({}));
              console.warn("Auth endpoint notice:", errData);
              if (errData.error && !errData.error.toLowerCase().includes('database error') && !errData.error.toLowerCase().includes('unexpected_failure')) {
                setFormError(`Notice on authentication password update: ${errData.error}`);
              }
            } else {
              setCurrentStaffPassword(cleanPwd);
            }
          } catch (authErr: any) {
            console.warn("Auth update warning:", authErr);
          }
        }

        const userUpdates: any = {
          name: form.name.trim()
        };
        if (cleanPwd) {
          userUpdates.password = cleanPwd;
        }

        if (targetUserId) {
          const { error: updateError } = await supabaseClient
            .from('users')
            .update(userUpdates)
            .eq('id', targetUserId);
            
          if (updateError) {
             console.error("Failed to update user in users table:", updateError);
          }
        } else {
          // Fallback if not found by original staff details
          if (targetEmail) {
            await supabaseClient
              .from('users')
              .update(userUpdates)
              .eq('email', targetEmail)
              .eq('role', 'Operation Staff');
          }
          if (originalStaff?.mobile) {
            await supabaseClient
              .from('users')
              .update(userUpdates)
              .eq('mobile', originalStaff.mobile)
              .eq('role', 'Operation Staff');
          }
        }

        await updateStaff(editingId, submissionPayload);
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 font-sans text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5';
        toast.innerHTML = '✅ Staff details updated successfully.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        handleCancel();
      } else {
        await addStaff({
          ...submissionPayload,
          password: finalPassword,
          Password: finalPassword
        } as any);
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 font-sans text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5';
        toast.innerHTML = '✅ Staff onboarded successfully.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        handleCancel();
      }
    } catch (err: any) {
      console.error("Error submitting staff:", err);
      const errMsg = formatStaffErrorMessage(err);
      const lower = errMsg.toLowerCase();
      if (lower.includes("already registered") || lower.includes("duplicate")) {
        const hasMob = lower.includes("mobile") || lower.includes("phone");
        const hasEm = lower.includes("email");
        if (hasMob && hasEm) {
          setMobileError("This mobile number is already registered.");
          setEmailError("This email address is already registered.");
          setFormError("This mobile number is already registered. This email address is already registered.");
        } else if (hasMob) {
          setMobileError("This mobile number is already registered.");
          setFormError("This mobile number is already registered.");
        } else if (hasEm) {
          setEmailError("This email address is already registered.");
          setFormError("This email address is already registered.");
        } else {
          setFormError(errMsg);
        }
      } else {
        setFormError(errMsg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (staffId: string, newStatus: 'Active' | 'Inactive') => {
    try {
      setOperatingId(staffId);
      await updateStaff(staffId, { status: newStatus });
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 font-sans text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5';
      toast.innerHTML = `✅ Staff member successfully ${newStatus === 'Active' ? 'activated' : 'deactivated'}.`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    } catch (err: any) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-rose-600 text-white px-4 py-2 rounded-xl shadow-lg z-50 font-sans text-sm font-bold flex items-center gap-2 animate-in slide-in-from-bottom-5';
      toast.innerHTML = `❌ Failed to update status: ${err.message || err}`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    } finally {
      setOperatingId(null);
    }
  };

  // Keep list filtered to crew profiles (photographers, videographers, drone operators, assistants) for high specificity
  const operationsCrew = staff.filter(st => {
    if (!staffSearchQuery.trim()) return true;
    const q = staffSearchQuery.toLowerCase();
    const nameMatch = st.name?.toLowerCase().includes(q);
    const mobileMatch = st.mobile?.toLowerCase().includes(q) || String(st.mobile || '').includes(q);
    return nameMatch || mobileMatch;
  });

  // Helper to get all active bookings/events for a staff member
  const getStaffActiveBookings = (staffName: string) => {
    const activeBookings: any[] = [];

    (leads || []).forEach((lead) => {
      const order = (orders || []).find(o => o.lead_id === lead.lead_id);
      const op = operations.find(o => o.order_id === (order?.order_id || lead.lead_id));

      // Determine booking/event status
      const bookingStage = order?.current_stage || lead.status;
      const eventStatus = op?.event_status || 'Assigned';

      // We skip completed/cancelled bookings
      const isCompletedOrCancelled = [
        'completed', 'event completed', 'raw footage received', 'event cancelled', 'closed', 'delivered', 'cancelled'
      ].includes(bookingStage.toLowerCase()) || [
        'completed', 'event completed', 'cancelled'
      ].includes(eventStatus.toLowerCase());

      if (isCompletedOrCancelled) {
        return;
      }

      // Check 1: Specific sub-events in lead.events
      let hasEventAssignment = false;
      if (lead.events && lead.events.length > 0) {
        lead.events.forEach((ev) => {
          const assignedNames = ev.assigned_staff_names 
            ? ev.assigned_staff_names.split(',').map(n => n.trim().toLowerCase()) 
            : [];
          
          if (assignedNames.includes(staffName.toLowerCase())) {
            hasEventAssignment = true;

            // Resolve equipment assigned to this event or staff
            let equipmentAssigned = 'None';
            const mobilesRaw = ev.assigned_staff_mobiles || '';
            if (mobilesRaw.includes(' || EQUIPMENT: JSON:')) {
               try {
                  const parts = mobilesRaw.split(' || EQUIPMENT: JSON:');
                  const staffEqs = JSON.parse(parts[1]);
                  const names = ev.assigned_staff_names ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase()) : [];
                  const idx = names.indexOf(staffName.toLowerCase());
                  if (idx !== -1 && staffEqs[idx] && staffEqs[idx].length > 0) {
                      equipmentAssigned = staffEqs[idx].join(', ');
                  }
               } catch(e) {}
            } else if (mobilesRaw.includes(' || EQUIPMENT: ')) {
              const parts = mobilesRaw.split(' || EQUIPMENT: ');
              equipmentAssigned = parts[1] || 'None';
            } else if (op?.equipment_kit) {
              equipmentAssigned = op.equipment_kit;
            }

            // Resolve role assigned
            const staffObj = staff?.find(s => s.name.toLowerCase() === staffName.toLowerCase());
            let assignedRole = staffObj ? staffObj.role : 'Crew';
            const sa = staffAssignments?.find(s => s.order_id === order?.order_id && s.staff_name.toLowerCase() === staffName.toLowerCase());
            if (sa?.staff_role) {
              assignedRole = sa.staff_role;
            }

            activeBookings.push({
              id: `event-${ev.id}-${staffName}`,
              orderId: order?.order_id || lead.order_id || lead.lead_id || '—',
              leadId: lead.lead_id,
              eventName: ev.event_type === 'Other' ? (ev.event_name || 'Other Event') : (ev.event_type || 'N/A'),
              clientName: lead.customer_name || order?.customer_name || 'N/A',
              shootType: ev.event_shoot_type || lead.shoot_type || 'N/A',
              assignedRole: assignedRole,
              reportingDate: ev.Reporting_date || ev.reporting_date || lead.Reporting_date || lead.reporting_date || '—',
              reportingTime: ev.reporting_time || (ev as any).Reporting_time || lead.reporting_time || '—',
              venue: ev.event_location || lead.event_location || 'N/A',
              leadStatus: lead.status,
              equipmentAssigned: equipmentAssigned,
              coordinator: lead.sales_person || lead.created_by || 'Operations Team',
              eventStatus: eventStatus,
              bookingStatus: bookingStage
            });
          }
        });
      }

      // Check 2: General order/operation assignments if no specific sub-events were matched
      if (!hasEventAssignment) {
        const isAssignedInOp = op && (
          op.photographer_assigned?.toLowerCase() === staffName.toLowerCase() ||
          op.videographer_assigned?.toLowerCase() === staffName.toLowerCase() ||
          op.drone_operator_assigned?.toLowerCase() === staffName.toLowerCase() ||
          op.assistant_assigned?.toLowerCase() === staffName.toLowerCase()
        );

        const hasStaffAssignment = staffAssignments?.some(sa => 
          sa.order_id === order?.order_id && 
          sa.staff_name.toLowerCase() === staffName.toLowerCase() &&
          sa.assignment_status !== 'Cancelled'
        );

        if (isAssignedInOp || hasStaffAssignment) {
          // Resolve role assigned
          let assignedRole = 'Crew';
          if (op) {
            if (op.photographer_assigned?.toLowerCase() === staffName.toLowerCase()) assignedRole = 'Photographer';
            else if (op.videographer_assigned?.toLowerCase() === staffName.toLowerCase()) assignedRole = 'Videographer';
            else if (op.drone_operator_assigned?.toLowerCase() === staffName.toLowerCase()) assignedRole = 'Drone Operator';
            else if (op.assistant_assigned?.toLowerCase() === staffName.toLowerCase()) assignedRole = 'Assistant';
          }
          
          const sa = staffAssignments?.find(s => s.order_id === order?.order_id && s.staff_name.toLowerCase() === staffName.toLowerCase());
          if (sa?.staff_role) {
            assignedRole = sa.staff_role;
          } else {
            const staffObj = staff?.find(s => s.name.toLowerCase() === staffName.toLowerCase());
            if (staffObj) {
              assignedRole = staffObj.role;
            }
          }

          activeBookings.push({
            id: `order-${lead.lead_id}-${staffName}`,
            orderId: order?.order_id || lead.order_id || lead.lead_id || '—',
            leadId: lead.lead_id,
            eventName: lead.custom_event_name || order?.event_type || lead.event_type || 'N/A',
            clientName: lead.customer_name || order?.customer_name || 'N/A',
            shootType: lead.shoot_type || order?.shoot_type || 'N/A',
            assignedRole: assignedRole,
            reportingDate: lead.Reporting_date || lead.reporting_date || '—',
            reportingTime: lead.reporting_time || (lead as any).Reporting_time || op?.reporting_time || '—',
            venue: lead.event_location || order?.event_location || 'N/A',
            leadStatus: lead.status,
            equipmentAssigned: op?.equipment_kit || 'None',
            coordinator: lead.sales_person || lead.created_by || 'Operations Team',
            eventStatus: eventStatus,
            bookingStatus: bookingStage
          });
        }
      }
    });

    activeBookings.sort((a, b) => {
      const dateA = a.reportingDate !== '—' && a.reportingDate !== 'N/A' ? a.reportingDate : '';
      const timeA = a.reportingTime !== '—' && a.reportingTime !== 'N/A' ? a.reportingTime : '';
      const tsA = parseDateTimeToTimestamp(dateA, timeA);

      const dateB = b.reportingDate !== '—' && b.reportingDate !== 'N/A' ? b.reportingDate : '';
      const timeB = b.reportingTime !== '—' && b.reportingTime !== 'N/A' ? b.reportingTime : '';
      const tsB = parseDateTimeToTimestamp(dateB, timeB);

      if (tsA !== tsB && tsA > 0 && tsB > 0) return tsB - tsA;
      if (tsA > 0) return -1;
      if (tsB > 0) return 1;
      return 0;
    });

    return activeBookings;
  };

  // Track active operations for each staff member
  const getStaffActiveAssignmentsCount = (name: string) => {
    return getStaffActiveBookings(name).length;
  };

  return (
    <div className="space-y-6">
      {/* Roster form - Modal */}
      {showStaffModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
        >
          <div className="w-full max-w-md flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl relative max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] min-h-0 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800 shrink-0 bg-zinc-900 z-10">
              <h3 className="text-xs font-mono font-black uppercase text-zinc-300 flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-amber-500" />
                <span>{editingId ? 'Edit Operative Profile' : 'Onboard Operation Staff'}</span>
              </h3>
              <button 
                type="button"
                onClick={handleCancel}
                className="text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-4"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
              <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs flex flex-col">
                {formError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
                <fieldset disabled={!canEdit} className="space-y-4 flex-1">
                  <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1">
                Staff Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Jack Richards"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full min-w-0 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1 flex items-center justify-between">
                <span>Mobile Number *</span>
                {editingId && <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1 font-bold">🔒 Locked (Permanent)</span>}
              </label>
              <input
                type="text"
                required
                disabled={Boolean(editingId)}
                readOnly={Boolean(editingId)}
                placeholder="e.g. +91 9876543210"
                value={form.mobile}
                onChange={(e) => {
                  setForm({ ...form, mobile: e.target.value });
                  if (formError) setFormError('');
                }}
                className={`w-full min-w-0 bg-zinc-950 border rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 ${editingId ? 'opacity-60 cursor-not-allowed bg-zinc-900/60 border-zinc-800' : formError && formError.toLowerCase().includes('mobile') ? 'border-rose-500/70' : 'border-zinc-850'}`}
              />
              {formError && formError.toLowerCase().includes('mobile') && (
                <p className="text-[11px] text-rose-400 font-sans mt-1">
                  {formError}
                </p>
              )}
            </div>

            <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1 flex items-center justify-between">
                <span>Email Address</span>
                {editingId && <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1 font-bold">🔒 Locked (Permanent)</span>}
              </label>
              <input
                type="email"
                disabled={Boolean(editingId)}
                readOnly={Boolean(editingId)}
                placeholder="e.g. staff@photocrew.pro"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`w-full min-w-0 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 ${editingId ? 'opacity-60 cursor-not-allowed bg-zinc-900/60 border-zinc-800' : ''}`}
              />
              {formError && formError.toLowerCase().includes('email') && (
                <p className="text-[11px] text-rose-400 font-sans mt-1">
                  {formError}
                </p>
              )}
            </div>

            <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1">
                Password {editingId ? <span className="text-zinc-500 font-normal lowercase">(leave blank to keep current)</span> : <span className="text-zinc-500 font-normal lowercase">(optional, auto-generated if blank)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={editingId ? "Leave blank to keep current password" : "Enter password (or auto-generated)"}
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    if (formError) setFormError('');
                  }}
                  className="w-full min-w-0 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 pr-10 text-white focus:outline-none focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-450 hover:text-white transition-colors cursor-pointer p-1"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {editingId && (
                <div className="mt-1.5 text-xs text-zinc-400 font-mono">
                  Current Password: <span className="text-white font-medium select-all font-mono">{currentStaffPassword || '********'}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1">
                WhatsApp Number
              </label>
              <input
                type="text"
                placeholder="e.g. +91 9876543210"
                value={form.whatsapp_number}
                onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                className="w-full min-w-0 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1">
                Staff Type *
              </label>
              <select
                required
                value={form.staff_type}
                onChange={(e) => setForm({ ...form, staff_type: e.target.value as 'In-House' | 'Freelancer' })}
                className="w-full min-w-0 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500/50"
              >
                <option value="In-House">In-House</option>
                <option value="Freelancer">Freelancer</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className="block text-[11px] font-mono font-extrabold uppercase text-zinc-450 mb-1">
                Skills
              </label>
              <div className="flex flex-wrap gap-2 mb-2 min-h-[40px] p-2 bg-zinc-950 border border-zinc-850 rounded-xl items-center w-full">
                {skills.length === 0 ? (
                  <span className="text-zinc-550 italic font-mono text-[10px] pl-1">No skills added yet</span>
                ) : (
                  skills.map((skill) => (
                    <div 
                      key={skill} 
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[10px] rounded-lg break-all"
                    >
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSkill(skill)}
                        className="text-zinc-500 hover:text-rose-400 focus:outline-none transition-colors ml-1 font-bold cursor-pointer shrink-0"
                        title={`Remove ${skill}`}
                      >
                        ✖
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  placeholder="Type a skill..."
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-amber-500/50 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="px-3 py-1.5 shrink-0 bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs transition-all font-mono font-bold cursor-pointer"
                >
                  + Add Skill
                </button>
              </div>
            </div>
          </fieldset>

          {canEdit ? (
            <div className="space-y-2 pt-2 border-t border-zinc-850">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-2.5 rounded-xl flex items-center gap-2 text-xs">
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3 py-2 bg-zinc-800 text-zinc-305 text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-black font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                >
                  {isSaving ? 'Processing...' : (editingId ? 'Save Changes' : 'Confirm Onboarding')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-950/40 p-3 rounded-xl border border-zinc-850 text-[10px] text-zinc-450 font-mono">
              🔒 Operations permissions required for editing.
            </div>
          )}
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Roster table - Full Width */}
      <div className="flex flex-col bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-xl space-y-4 overflow-hidden h-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-2.5">
          <h3 className="text-xs font-mono font-black uppercase text-zinc-300 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-amber-500" />
            <span>ACTIVE ROSTER SUMMARY ({operationsCrew.length} registered)</span>
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff by name or mobile..."
                value={staffSearchQuery}
                onChange={(e) => setStaffSearchQuery(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 w-60"
              />
            </div>
            {canEdit && (
              <button 
                type="button"
                onClick={() => {
                  handleCancel();
                  setShowStaffModal(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-colors shadow-lg shadow-amber-500/20"
              >
                <PlusCircle className="w-4 h-4" />
                + Add Staff
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto text-xs flex-1 bg-zinc-950/30 rounded-xl border border-zinc-850">
          <table className="w-full text-left border-collapse min-w-max">
            <thead>
              <tr className="border-b border-zinc-850 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-950/30">
                <th className="p-3 font-bold font-mono text-[10px] uppercase text-zinc-400 text-center w-16 min-w-[64px] whitespace-nowrap">S.NO</th>
                <th className="p-3.5">Code / Roster</th>
                <th className="p-3.5 font-bold">Contact Node</th>
                <th className="p-3.5 font-bold">Skills</th>
                <th className="p-3.5 font-bold">Roster Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-850/60 text-zinc-300">
              {operationsCrew.length > 0 ? (
                operationsCrew.map((st, idx) => {
                  const activeAssignmentsCount = getStaffActiveAssignmentsCount(st.name);
                  const staffSkills = getStaffSkillsList(st);
                  const isSkillsOpen = openSkillsStaffId === st.staff_id;

                  return (
                    <tr key={st.staff_id} className="hover:bg-zinc-900/10 transition-all">
                      <td className="p-3 font-mono text-zinc-400 text-center text-xs font-bold w-16 min-w-[64px] whitespace-nowrap">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-zinc-100">{st.name}</div>
                      </td>
                      <td className="p-3.5 space-y-1 text-[11px] text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-zinc-550 flex-shrink-0" />
                          <span>{st.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-zinc-550 flex-shrink-0" />
                          <span>{st.mobile}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-[10px]">
                          <span>Dept: {st.department}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-500 font-mono text-[10px]">
                          <span>Type: {st.staff_type || 'In-House'}</span>
                        </div>
                      </td>
                      <td className="p-3.5 relative skills-dropdown-container">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenSkillsStaffId(prev => prev === st.staff_id ? null : st.staff_id);
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer select-none ${
                              isSkillsOpen 
                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/10' 
                                : staffSkills.length > 0
                                  ? 'bg-zinc-900/90 hover:bg-zinc-850 border-zinc-800 hover:border-zinc-700 text-zinc-200'
                                  : 'bg-zinc-900/40 hover:bg-zinc-900/70 border-zinc-850 text-zinc-400'
                            }`}
                            title={staffSkills.length > 0 ? `${staffSkills.length} skills recorded - click to view` : 'No skills recorded - click to view'}
                          >
                            <span className="font-mono text-[11px] font-bold">Skills</span>
                            {staffSkills.length > 0 && (
                              <span className="px-1.5 py-0.2 bg-zinc-800 text-amber-400 rounded text-[10px] font-mono font-bold border border-zinc-750">
                                {staffSkills.length}
                              </span>
                            )}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isSkillsOpen ? 'rotate-180 text-amber-400' : 'text-zinc-500'}`} />
                          </button>

                          {isSkillsOpen && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="absolute left-0 top-full mt-1.5 z-40 w-64 max-w-[90vw] bg-zinc-900 border border-zinc-750 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                            >
                              <div className="p-2.5 bg-zinc-950/85 border-b border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>Skills</span>
                                  {staffSkills.length > 0 && (
                                    <span className="text-zinc-500 font-normal text-[10px]">({staffSkills.length})</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setOpenSkillsStaffId(null)}
                                  className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
                                  title="Close"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="p-2 max-h-56 overflow-y-auto custom-scrollbar space-y-1">
                                {staffSkills.length > 0 ? (
                                  staffSkills.map((skill, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-950/70 border border-zinc-850 rounded-lg text-xs text-zinc-200 font-sans"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                      <span className="break-words font-medium">{skill}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="py-4 px-2 text-center text-zinc-500 font-mono text-[11px] italic">
                                    No skills added
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                          st.status === 'Active' 
                            ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20' 
                            : 'bg-zinc-805 text-zinc-450 border-zinc-755'
                        }`}>
                          {st.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleSelectEdit(st)}
                                disabled={operatingId !== null}
                                className="p-1.5 hover:bg-zinc-850 text-zinc-400 hover:text-white rounded border border-transparent hover:border-zinc-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Edit operatives profile"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {st.status === 'Active' ? (
                                <button
                                  onClick={() => handleStatusChange(st.staff_id, 'Inactive')}
                                  disabled={operatingId !== null}
                                  className="px-2 py-1 text-[10px] font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/25 hover:border-amber-500/40 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  title="Deactivate Staff Member"
                                >
                                  {operatingId === st.staff_id ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                  ) : null}
                                  <span>Deactivate</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleStatusChange(st.staff_id, 'Active')}
                                  disabled={operatingId !== null}
                                  className="px-2 py-1 text-[10px] font-mono font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-450 border border-emerald-500/25 hover:border-emerald-500/40 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                  title="Activate Staff Member"
                                >
                                  {operatingId === st.staff_id ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                  ) : null}
                                  <span>Activate</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-zinc-550 italic font-mono">
                    No field personnel currently on call.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedStaffBookings && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-2 sm:p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-7xl 2xl:max-w-screen-2xl min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2400px] min-[3840px]:max-w-[3200px] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] min-h-0"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-6 border-b border-zinc-850 flex items-center justify-between bg-zinc-950/40 shrink-0">
                <div className="space-y-1">
                  <h3 className="text-sm font-mono font-bold uppercase text-amber-500 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    Active Roster Summary — {selectedStaffBookings.staffName}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Currently allocated events and operations on call.
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStaffBookings(null)}
                  className="text-zinc-400 hover:text-white bg-zinc-850 hover:bg-zinc-855 p-2 rounded-full cursor-pointer transition-colors"
                  type="button"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Search Bar */}
                {selectedStaffBookings.bookings.length > 0 && (
                  <div className="relative max-w-md w-full">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-zinc-550">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Search by event, client, role, date or location..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50 placeholder-zinc-550 font-mono"
                    />
                  </div>
                )}

                {/* Event Details Table */}
                {(() => {
                  const query = searchQuery.trim().toLowerCase();
                  const filtered = selectedStaffBookings.bookings.filter(b => {
                    if (!query) return true;
                    return (
                      b.eventName?.toLowerCase().includes(query) ||
                      b.clientName?.toLowerCase().includes(query) ||
                      b.shootType?.toLowerCase().includes(query) ||
                      b.assignedRole?.toLowerCase().includes(query) ||
                      b.venue?.toLowerCase().includes(query) ||
                      b.eventDate?.toLowerCase().includes(query)
                    );
                  });

                  if (selectedStaffBookings.bookings.length === 0) {
                    return (
                      <div className="py-12 text-center border border-dashed border-zinc-800 rounded-2xl">
                        <div className="text-zinc-500 italic font-mono text-sm">
                          No Active Bookings
                        </div>
                        <p className="text-xs text-zinc-600 mt-1">
                          This staff member has no assigned active events or shoots.
                        </p>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-zinc-500 italic font-mono text-xs">
                        No bookings match your search query "{searchQuery}".
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto rounded-2xl border border-zinc-850 bg-zinc-950/20">
                      <table className="w-full text-left border-collapse min-w-max text-xs">
                        <thead>
                          <tr className="border-b border-zinc-850 bg-zinc-950/60 font-mono text-[10px] uppercase text-zinc-400">
                            <th className="p-3.5 pl-4 font-bold min-w-[120px]">Order ID</th>
                            <th className="p-3.5 font-bold min-w-[160px]">Customer Name</th>
                            <th className="p-3.5 font-bold min-w-[140px]">Event Type</th>
                            <th className="p-3.5 font-bold min-w-[130px]">Reporting Date</th>
                            <th className="p-3.5 font-bold min-w-[120px]">Reporting Time</th>
                            <th className="p-3.5 font-bold min-w-[180px]">Location</th>
                            <th className="p-3.5 font-bold min-w-[140px]">Assigned Role</th>
                            <th className="p-3.5 font-bold min-w-[180px]">Equipment Details</th>
                            <th className="p-3.5 font-bold text-left whitespace-nowrap min-w-[150px]">Status</th>
                            <th className="p-3.5 pr-4 font-bold text-center min-w-[120px]">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850/60 text-zinc-300">
                          {filtered.map((b) => (
                            <tr key={b.id} className="hover:bg-zinc-900/20 transition-all select-text">
                              {/* 1. Order ID */}
                              <td className="p-3.5 pl-4 font-mono font-bold text-amber-400 text-xs whitespace-nowrap">
                                {b.orderId || b.id || '—'}
                              </td>

                              {/* 2. Customer Name */}
                              <td className="p-3.5 font-bold text-zinc-100 text-xs">
                                {b.clientName}
                              </td>

                              {/* 3. Event Type */}
                              <td className="p-3.5 text-zinc-300 font-mono text-[11px]">
                                {b.eventName || b.shootType}
                              </td>

                              {/* 4. Reporting Date */}
                              <td className="p-3.5 font-mono text-zinc-300 whitespace-nowrap font-medium text-xs">
                                {b.reportingDate && b.reportingDate !== '—' && b.reportingDate !== 'N/A'
                                  ? formatDateDDMMYY(b.reportingDate) || b.reportingDate
                                  : '—'}
                              </td>

                              {/* 5. Reporting Time */}
                              <td className="p-3.5 font-mono text-zinc-400 whitespace-nowrap text-xs">
                                {b.reportingTime && b.reportingTime !== '—' && b.reportingTime !== 'N/A'
                                  ? formatTime12Hour(b.reportingTime) || b.reportingTime
                                  : '—'}
                              </td>

                              {/* 6. Location */}
                              <td className="p-3.5 text-zinc-300 max-w-xs break-words text-xs" title={b.venue}>
                                {b.venue || '—'}
                              </td>

                              {/* 7. Assigned Role */}
                              <td className="p-3.5 text-indigo-400 font-mono font-bold text-[11px] whitespace-nowrap">
                                {b.assignedRole}
                              </td>

                              {/* 8. Equipment Details */}
                              <td className="p-3.5 font-mono text-amber-400 font-bold text-[11px] max-w-xs break-words">
                                {b.equipmentAssigned || 'None'}
                              </td>

                              {/* 9. Status */}
                              <td className="p-3.5 align-middle text-left whitespace-nowrap min-w-[150px]">
                                <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wide border whitespace-nowrap leading-none shadow-sm ${
                                  (b.eventStatus || '').toLowerCase() === 'completed' || (b.eventStatus || '').toLowerCase() === 'event completed'
                                    ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                }`}>
                                  {b.eventStatus || b.bookingStatus || b.leadStatus || 'Active'}
                                </span>
                              </td>

                              {/* 10. Actions */}
                              <td className="p-3.5 pr-4 text-center whitespace-nowrap">
                                <span className="px-2.5 py-1 rounded-lg bg-zinc-850 text-zinc-400 font-mono text-[10px] font-bold border border-zinc-800">
                                  {b.bookingStatus || 'Assigned'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-6 border-t border-zinc-850 flex justify-end bg-zinc-950/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedStaffBookings(null)}
                  className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
