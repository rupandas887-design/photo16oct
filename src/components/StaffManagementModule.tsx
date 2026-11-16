import React, { useState, useEffect, useRef } from 'react';
import { useRole } from './RoleContext';
import { Staff } from '../types';
import { triggerAutoScrollAndFocus, checkGlobalStaffUniqueness, formatStaffErrorMessage, scrollToFirstError } from '../utils';
import { 
  Users, UserPlus, Phone, Mail, Award, Clock, FileText, ToggleLeft, ToggleRight, ShieldAlert,
  Search, Filter, Calendar, FolderOpen, Heart, CheckCircle2, ChevronRight, X, Sparkles, Image,
  Key, Eye, EyeOff, Lock
} from 'lucide-react';

export const StaffManagementModule: React.FC = () => {
  const { 
    staff, addStaff, updateStaff, production, currentRole,
    specialities = [], addSpeciality, updateSpeciality, deactivateSpeciality,
    resetUserPassword, users, productionStaff = [], fetchStaffPasswordStatus
  } = useRole();
  
  // Tabs: 'dashboard' | 'list' | 'add' | 'specialities'
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'list' | 'add' | 'specialities'>('dashboard');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Automatically scroll to error when validation error appears
  useEffect(() => {
    if (formError) {
      scrollToFirstError();
    }
  }, [formError]);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Form State for Adding Staff
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Editor');
  const [department, setDepartment] = useState('Editing');
  const [status, setStatus] = useState<'Active' | 'Inactive'>('Active');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [profilePhoto, setProfilePhoto] = useState('');
  const [notes, setNotes] = useState('');
  const [showPhotoTip, setShowPhotoTip] = useState(false);

  // Password & credentials states
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [currentStaffPassword, setCurrentStaffPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(true);
  const [loadingCurrentPassword, setLoadingCurrentPassword] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const currentPasswordReqIdRef = useRef(0);

  // Password reset modal states
  const [resetModalStaff, setResetModalStaff] = useState<Staff | null>(null);
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showNewStaffPassword, setShowNewStaffPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');

  // Specialties & experience fields
  const [prodSpeciality, setProdSpeciality] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [experience, setExperience] = useState('Junior Editor (1-2 Years)');
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  // Specialty manager inline form states
  const [newSpecName, setNewSpecName] = useState('');
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [editingSpecName, setEditingSpecName] = useState('');

  useEffect(() => {
    if (activeSubTab === 'add') {
      triggerAutoScrollAndFocus('#add_staff_form', 150);
    }
  }, [activeSubTab]);

  // Core production roles requested by user
  const PRODUCTION_ROLES = [
    'Editor', 'Senior Editor', 'Photo Editor', 'Video Editor', 
    'Album Designer', 'Color Grading Artist', 'Retoucher', 
    'Motion Graphics Designer', 'Delivery Coordinator', 'Production Manager', 
    'Studio Coordinator', 'Freelancer'
  ];

  const DEPARTMENTS = [
    'Editing', 'Post-Production', 'Design', 'Operations', 'Management', 'Freelance'
  ];

  // Calculations for dashboard
  const totalStaff = staff.length;
  const activeStaff = staff.filter(s => s.status === 'Active').length;
  
  // Production assignments summary
  const getStaffStats = (staffName: string) => {
    const staffProjects = production.filter(p => 
      p.editor_assigned?.toLowerCase() === staffName.toLowerCase()
    );
    const completed = staffProjects.filter(p => 
      ['Approved', 'Delivered', 'Final Approval', 'Project Delivered', 'Project Closed'].includes(p.editing_status)
    ).length;
    const pending = staffProjects.filter(p => 
      !['Approved', 'Delivered', 'Final Approval', 'Project Delivered', 'Project Closed'].includes(p.editing_status)
    ).length;
    return {
      assigned: staffProjects.length,
      completed,
      pending
    };
  };

  const dashboardStats = staff.reduce((acc, current) => {
    const stats = getStaffStats(current.name);
    return {
      totalAssigned: acc.totalAssigned + stats.assigned,
      totalCompleted: acc.totalCompleted + stats.completed,
      totalPending: acc.totalPending + stats.pending
    };
  }, { totalAssigned: 0, totalCompleted: 0, totalPending: 0 });

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!name.trim() || !email.trim() || !mobile.trim()) {
      setFormError('Please fill out all required fields (Name, Email, Mobile).');
      return;
    }

    const cleanPwd = (staffPassword || '').trim();
    if (!editingStaffId && (!cleanPwd || cleanPwd.length < 6)) {
      setFormError('Please provide a password of at least 6 characters for the staff account.');
      return;
    }
    if (editingStaffId && cleanPwd && cleanPwd.length < 6) {
      setFormError('New password must be at least 6 characters long.');
      return;
    }

    const payload: any = {
      name: name.trim(),
      mobile: mobile.trim(),
      whatsapp_number: (whatsappNumber || mobile).trim(),
      email: email.trim(),
      role,
      department,
      status,
      joining_date: joiningDate,
      profile_photo: profilePhoto || undefined,
      notes: notes || undefined,
      production_role_speciality: prodSpeciality,
      experience: experience,
      Skill: skills
    };

    if (!editingStaffId) {
      const uniquenessCheck = checkGlobalStaffUniqueness({
        mobile,
        email,
        excludeId: null,
        usersList: users,
        opStaffList: staff,
        prodStaffList: productionStaff
      });

      if (!uniquenessCheck.isUnique) {
        let errMsg = uniquenessCheck.error;
        if (uniquenessCheck.isMobileDuplicate && uniquenessCheck.isEmailDuplicate) {
          errMsg = "This mobile number is already registered. This email address is already registered.";
        } else if (uniquenessCheck.isMobileDuplicate) {
          errMsg = "This mobile number is already registered.";
        } else if (uniquenessCheck.isEmailDuplicate) {
          errMsg = "This email address is already registered.";
        } else {
          errMsg = errMsg || "This mobile number is already registered. Please use a different number.";
        }
        setFormError(errMsg);
        return;
      }
    }

    try {
      if (editingStaffId) {
        const { mobile: _m, email: _e, ...safePayload } = payload;
        await updateStaff(editingStaffId, {
          ...safePayload,
          ...(cleanPwd ? { password: cleanPwd } : {})
        });
        if (cleanPwd) {
          setCurrentStaffPassword(cleanPwd);
          setShowCurrentPassword(true);
        }

        setFormSuccess(
          cleanPwd
            ? '✅ Staff member details and password updated successfully!'
            : '✅ Staff member updated successfully!'
        );
        setEditingStaffId(null);
      } else {
        await addStaff({ ...payload, password: cleanPwd });
        setFormSuccess('✅ Staff member registered and login password configured successfully!');
      }

      // Reset Form
      setName('');
      setMobile('');
      setWhatsappNumber('');
      setEmail('');
      setStaffPassword('');
      setShowStaffPassword(false);
      currentPasswordReqIdRef.current += 1;
      setCurrentStaffPassword('');
      setShowCurrentPassword(true);
      setLoadingCurrentPassword(false);
      setCurrentPasswordError('');
      setRole('Editor');
      setDepartment('Editing');
      setStatus('Active');
      setJoiningDate(new Date().toISOString().split('T')[0]);
      setProfilePhoto('');
      setNotes('');
      setProdSpeciality('');
      setSkills([]);
      setExperience('Junior Editor (1-2 Years)');

      setActiveSubTab('list');
      setTimeout(() => setFormSuccess(''), 4000);
    } catch (err: any) {
      const errMsg = formatStaffErrorMessage(err);
      setFormError(errMsg);
    }
  };

  const handleResetStaffPasswordModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMessage('');
    const cleanNewPassword = (newStaffPassword || '').trim();
    if (!resetModalStaff || !cleanNewPassword || cleanNewPassword.length < 6) {
      setResetErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsResetting(true);
    setResetSuccessMessage('');

    try {
      // Update password strictly via RoleContext.updateStaff so staff_id -> auth_user_id mapping & public.users sync stay 1-to-1
      if (resetModalStaff.staff_id) {
        await updateStaff(resetModalStaff.staff_id, { password: cleanNewPassword } as any);
      } else {
        const staffEmail = String(resetModalStaff.email ?? '').trim().toLowerCase();
        const staffMobileDigits = String(resetModalStaff.mobile ?? '').replace(/\D/g, '');
        const staffMobile10 = staffMobileDigits.length >= 10 ? staffMobileDigits.slice(-10) : staffMobileDigits;
        const targetUser = users.find(u => {
          const uEmail = String(u.email ?? '').trim().toLowerCase();
          const uMobileDigits = String(u.mobile ?? '').replace(/\D/g, '');
          const uMobile10 = uMobileDigits.length >= 10 ? uMobileDigits.slice(-10) : uMobileDigits;
          if (staffEmail && uEmail && uEmail === staffEmail) return true;
          if (staffMobile10.length >= 7 && uMobile10.length >= 7 && uMobile10 === staffMobile10) return true;
          return false;
        });
        if (!targetUser) {
          throw new Error('Could not locate matching authentication user for this staff member.');
        }
        await resetUserPassword(targetUser.id, cleanNewPassword);
      }

      if (editingStaffId && resetModalStaff.staff_id === editingStaffId) {
        setCurrentStaffPassword(cleanNewPassword);
        setShowCurrentPassword(true);
      }
      setResetSuccessMessage(`Password for ${resetModalStaff.name} has been updated successfully. They can now log in with their email/mobile and this new password.`);
      setTimeout(() => {
        setResetModalStaff(null);
        setNewStaffPassword('');
        setShowNewStaffPassword(false);
        setResetSuccessMessage('');
        setResetErrorMessage('');
      }, 2000);
    } catch (err: any) {
      setResetErrorMessage('Failed to reset password: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleEditStaffClick = (member: Staff) => {
    const reqId = ++currentPasswordReqIdRef.current;
    setEditingStaffId(member.staff_id);
    setFormError('');
    setFormSuccess('');
    setName(member.name);
    setMobile(member.mobile);
    setWhatsappNumber(member.whatsapp_number || '');
    setEmail(member.email);
    setStaffPassword('');
    setShowStaffPassword(false);
    setCurrentStaffPassword('');
    setShowCurrentPassword(true);
    setCurrentPasswordError('');
    setLoadingCurrentPassword(true);
    setRole(member.role);
    setDepartment(member.department);
    setStatus(member.status);
    setJoiningDate(member.joining_date);
    setProfilePhoto(member.profile_photo || '');
    setNotes(member.notes || '');
    setProdSpeciality(member.production_role_speciality || '');
    setSkills(Array.isArray(member.Skill) ? member.Skill : []);
    setExperience(member.experience || 'Junior Editor (1-3 Years)');
    setActiveSubTab('add');
    const inferredStaffType =
      String(member.staff_id || '').startsWith('STF-') ||
      String(member.department || '').toLowerCase().includes('post') ||
      String(member.department || '').toLowerCase().includes('prod') ||
      String(member.role || '').toLowerCase().includes('editor')
        ? 'production'
        : 'operations';
    fetchStaffPasswordStatus(member, inferredStaffType).then((res) => {
      if (currentPasswordReqIdRef.current !== reqId) return;
      setCurrentStaffPassword(res.password || '');
      setCurrentPasswordError(res.error || '');
      setLoadingCurrentPassword(false);
    });
    setTimeout(() => {
      triggerAutoScrollAndFocus('#add_staff_form', 150);
    }, 50);
  };

  const handleToggleStatus = (member: Staff) => {
    const nextStatus = member.status === 'Active' ? 'Inactive' : 'Active';
    updateStaff(member.staff_id, { status: nextStatus });
  };

  // Filtered staff list
  const filteredStaff = staff.filter(member => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.mobile.includes(searchQuery);
    
    const matchesRole = roleFilter === 'All' || member.role === roleFilter;
    const matchesStatus = statusFilter === 'All' || member.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 border border-zinc-900 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" />
            <h1 className="text-xl font-black uppercase tracking-wider text-white">
              Studio Crew Registry & Staff Directory
            </h1>
          </div>
          <p className="text-xs text-zinc-400 font-mono">
            CREW ASSIGNMENTS, CAPACITY ALLOCATIONS AND INTERACTIVE WORKLOAD METRICS
          </p>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800 z-10">
          <button
            onClick={() => setActiveSubTab('dashboard')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'dashboard'
                ? 'bg-gradient-to-r from-violet-500/20 to-indigo-500/20 text-violet-400 border border-violet-500/30'
                : 'text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveSubTab('list')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold rounded-lg transition-all cursor-pointer ${
              activeSubTab === 'list'
                ? 'bg-gradient-to-r from-violet-500/20 to-indigo-500/20 text-violet-400 border border-violet-500/30'
                : 'text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            Crew Roster ({staff.length})
          </button>
          <button
            onClick={() => setActiveSubTab('add')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
              activeSubTab === 'add'
                ? 'bg-gradient-to-r from-violet-500/20 to-indigo-500/20 text-violet-400 border border-violet-500/30'
                : 'text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Onboard Staff</span>
          </button>
          <button
            onClick={() => setActiveSubTab('specialities')}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
              activeSubTab === 'specialities'
                ? 'bg-gradient-to-r from-violet-500/20 to-indigo-500/20 text-violet-400 border border-violet-500/30'
                : 'text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Specialities ({specialities.length})</span>
          </button>
        </div>
      </div>

      {/* DASHBOARD TAB CONTAINER */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          
          {/* Key Metrics row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            
            {/* Total Staff member count */}
            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden group hover:border-violet-500/20 transition-all shadow-md">
              <span className="absolute bottom-4 right-4 text-zinc-800 font-bold text-5xl select-none font-mono opacity-20">TS</span>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Total Crew Members</div>
              <div className="text-3xl font-black text-white font-mono mt-1">{totalStaff}</div>
              <div className="text-[10px] text-zinc-400 mt-2 font-mono">FTE + Contractors</div>
            </div>

            {/* Active Staff */}
            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden group hover:border-violet-500/20 transition-all shadow-md">
              <span className="absolute bottom-4 right-4 text-zinc-800 font-bold text-5xl select-none font-mono opacity-20">AS</span>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Active Staff</div>
              <div className="text-3xl font-black text-emerald-400 font-mono mt-1">{activeStaff}</div>
              <div className="text-[10px] text-zinc-400 mt-2 font-mono">
                {totalStaff - activeStaff} Inactive
              </div>
            </div>

            {/* Assigned Projects */}
            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden group hover:border-violet-500/20 transition-all shadow-md">
              <span className="absolute bottom-4 right-4 text-zinc-800 font-bold text-5xl select-none font-mono opacity-20">AP</span>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Assigned Projects</div>
              <div className="text-3xl font-black text-violet-400 font-mono mt-1">{dashboardStats.totalAssigned}</div>
              <div className="text-[10px] text-zinc-400 mt-2 font-mono">Total allocated queue</div>
            </div>

            {/* Completed Projects */}
            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden group hover:border-violet-500/20 transition-all shadow-md">
              <span className="absolute bottom-4 right-4 text-zinc-800 font-bold text-5xl select-none font-mono opacity-20">CP</span>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Completed Projects</div>
              <div className="text-3xl font-black text-teal-400 font-mono mt-1">{dashboardStats.totalCompleted}</div>
              <div className="text-[10px] text-zinc-400 mt-2 font-mono">Master releases archived</div>
            </div>

            {/* Pending Projects */}
            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden group hover:border-violet-500/20 transition-all shadow-md">
              <span className="absolute bottom-4 right-4 text-zinc-800 font-bold text-5xl select-none font-mono opacity-20">PP</span>
              <div className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider">Pending Release</div>
              <div className="text-3xl font-black text-amber-500 font-mono mt-1">{dashboardStats.totalPending}</div>
              <div className="text-[10px] text-zinc-400 mt-2 font-mono">Currently in editing pipelines</div>
            </div>

          </div>

          {/* Quick Staff Availability Grid */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-300 border-b border-zinc-900 pb-3 font-mono flex items-center justify-between">
              <span>Crew Allocation Matrix & Load Factors</span>
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              {staff.map(member => {
                const stats = getStaffStats(member.name);
                const loadPercent = stats.pending > 3 ? 100 : (stats.pending / 3) * 100;
                let statusColor = 'bg-zinc-800';
                if (member.status === 'Inactive') statusColor = 'text-zinc-650 bg-zinc-950 border-zinc-900';
                else if (loadPercent > 80) statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                else if (loadPercent > 30) statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                else statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                return (
                  <div key={member.staff_id} className="bg-[#030303] border border-zinc-900 p-4 rounded-xl flex flex-col justify-between hover:border-zinc-800 transition-all duration-150">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-950/40 border border-violet-900/30 flex items-center justify-center font-black text-violet-400 font-mono select-none">
                          {member.name.split(' ').map(n=>n[0]).join('')}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white leading-tight">{member.name}</div>
                          <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{member.role}</div>
                        </div>
                      </div>
                      
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-wider font-bold ${
                        member.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                      }`}>
                        {member.status}
                      </span>
                    </div>

                    <div className="space-y-2 mt-4 pt-3 border-t border-zinc-900">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-zinc-500 uppercase">Workload Capacity</span>
                        <span className="font-bold text-white">{stats.pending} Active / {stats.completed} Done</span>
                      </div>
                      
                      {/* Capacity line bar */}
                      <div className="w-full bg-zinc-900 h-1 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            stats.pending >= 3 ? 'bg-rose-500' : stats.pending >= 2 ? 'bg-amber-500' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${member.status === 'Inactive' ? 0 : Math.min(100, (stats.pending / 4) * 100)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono pt-1 text-zinc-500">
                        <span>Dept: <strong className="text-zinc-350">{member.department}</strong></span>
                        <span className="text-[9px] uppercase font-bold tracking-wider rounded-md border px-1.5 py-0.5 bg-zinc-950" style={{ borderColor: statusColor.includes('border') ? statusColor.split(' ')[2]?.replace('border-', '') : '#18181b' }}>
                          {member.status === 'Inactive' ? 'OFFLINE' : stats.pending >= 3 ? 'OVERLOAD' : stats.pending >= 1 ? 'ACTIVE' : 'AVAILABLE'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {staff.length === 0 && (
                <div className="col-span-3 py-12 text-center text-zinc-600 bg-zinc-950 border border-zinc-900 rounded-xl uppercase font-mono text-xs">
                  No staff registered. Press Add Staff to seed your workflow.
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ROSTER / LIST TAB CONTAINER */}
      {activeSubTab === 'list' && (
        <div className="space-y-4">
          {formSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}
          
          {/* Filters Bar */}
          <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between relative">
            <div className="flex items-center gap-2.5 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800 w-full md:w-80">
              <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search staff by name, email or cell..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-white border-none outline-none focus:ring-0 w-full font-sans placeholder-zinc-500"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto">
              {/* Role filter */}
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[10px] font-mono text-zinc-400 uppercase hidden sm:inline">Role:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 px-3 text-xs text-zinc-300 font-mono focus:border-violet-500 outline-none cursor-pointer"
                >
                  <option value="All">All Roles</option>
                  {PRODUCTION_ROLES.map(roleOpt => (
                    <option key={roleOpt} value={roleOpt}>{roleOpt}</option>
                  ))}
                </select>
              </div>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 px-3 text-xs text-zinc-300 font-mono focus:border-violet-500 outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Roster Grid list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStaff.map(member => {
              const stats = getStaffStats(member.name);
              return (
                <div key={member.staff_id} className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl relative shadow-md flex flex-col justify-between hover:border-zinc-850 transition-colors">
                  
                  {/* Photo & Identity details */}
                  <div className="flex items-start gap-4">
                    {member.profile_photo ? (
                      <img 
                        src={member.profile_photo} 
                        referrerPolicy="no-referrer"
                        alt={member.name} 
                        className="w-14 h-14 rounded-2xl object-cover border border-zinc-800 bg-zinc-900"
                        onError={(e) => {
                          // Fallback on broken URL path
                          e.currentTarget.style.display = 'none';
                        }} 
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-violet-500/20 flex items-center justify-center font-black text-lg text-violet-400 font-mono select-none">
                        {member.name.split(' ').map(n=>n[0]).join('')}
                      </div>
                    )}

                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white capitalize">{member.name}</h3>
                        <span className={`px-2 py-0.5 rounded-[5px] text-[8px] font-mono tracking-wider font-extrabold uppercase leading-none mt-0.5 ${
                          member.status === 'Active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                        }`}>
                          {member.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-400 font-sans">
                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                          <span>{(Array.isArray(member.Skill) && member.Skill.length > 0) ? member.Skill.join(' • ') : 'No Skills Defined'}</span>
                        </span>
                        {member.experience && (
                          <>
                            <span className="text-zinc-650">•</span>
                            <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 px-1.5 py-0.5 rounded">Exp: {member.experience}</span>
                          </>
                        )}
                        <span className="text-zinc-650">•</span>
                        <span className="bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono leading-none rounded text-zinc-300">
                          {member.department}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notes / Descriptions */}
                  {member.notes && (
                    <p className="text-xs text-zinc-400 font-sans mt-3 px-3 py-2 bg-zinc-900/50 border border-zinc-900 rounded-lg italic">
                      "{member.notes}"
                    </p>
                  )}

                  {/* Contact details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 py-3 border-t border-b border-zinc-900 text-[10px]">
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Mobile</div>
                      <a href={`tel:${member.mobile}`} className="font-mono font-bold text-zinc-300 hover:text-white flex items-center gap-1 break-words" title={member.mobile}>
                        <Phone className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="break-words">{member.mobile}</span>
                      </a>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">WhatsApp</div>
                      <a 
                        href={`https://api.whatsapp.com/send?phone=${String(member.whatsapp_number ?? member.mobile ?? '').replace(/[^0-9]/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="font-mono font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 break-words" 
                        title={String(member.whatsapp_number ?? member.mobile ?? '')}
                      >
                        <span className="text-emerald-450 text-[11px] font-bold shrink-0">💬</span>
                        <span className="break-words">{String(member.whatsapp_number || member.mobile || '')}</span>
                      </a>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase">Email</div>
                      <a href={`mailto:${member.email}`} className="font-mono font-bold text-zinc-300 hover:text-white flex items-center gap-1 break-words" title={member.email}>
                        <Mail className="w-3 h-3 text-zinc-500 shrink-0" />
                        <span className="break-words">{member.email}</span>
                      </a>
                    </div>
                  </div>

                  {/* Stats & Actions */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Joined {member.joining_date}</span>
                      </span>
                      <span>•</span>
                      <span className="font-bold text-white">
                        {stats.pending} Active
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setResetModalStaff(member);
                          setNewStaffPassword('');
                          setShowNewStaffPassword(false);
                          setResetSuccessMessage('');
                          setResetErrorMessage('');
                        }}
                        title="Reset Staff Login Password"
                        className="p-1 px-2.5 text-[9px] font-mono font-bold border border-violet-800/40 hover:border-violet-600 bg-violet-950/30 text-violet-300 rounded-lg cursor-pointer select-none transition-colors flex items-center gap-1"
                      >
                        <Key className="w-3 h-3 text-violet-400" />
                        <span>Reset PW</span>
                      </button>
                      <button
                        onClick={() => handleEditStaffClick(member)}
                        className="p-1 px-2.5 text-[9px] font-mono font-bold border border-zinc-800 hover:border-zinc-650 bg-zinc-900 text-zinc-300 rounded-lg cursor-pointer select-none transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(member)}
                        title="Toggle Active/Inactive Staff member Status"
                        className="p-1 px-2.5 text-[9px] font-mono font-bold border border-zinc-800 hover:border-zinc-650 bg-zinc-900 text-zinc-300 rounded-lg cursor-pointer select-none transition-colors"
                      >
                        {member.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
            {filteredStaff.length === 0 && (
              <div className="col-span-2 py-16 text-center text-zinc-500 bg-zinc-950 border border-zinc-900 rounded-2xl uppercase font-mono text-xs">
                No staff members found matching search filters.
              </div>
            )}
          </div>

        </div>
      )}

      {/* ADD / ONBOARD TABLE FORM */}
      {activeSubTab === 'add' && (
        <form id="add_staff_form" onSubmit={handleAddStaffSubmit} className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-6 shadow-xl relative">
          <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-violet-500/50 rounded-full" />
          <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-violet-500/50 rounded-full" />
          
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-350 border-b border-zinc-900 pb-3 font-mono">
            STAFF DIRECTORY ENROLLMENT PACK
          </h2>

          {formError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>Staff Member Name</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Liam Campbell"
                value={name}
                onChange={(e) => { setName(e.target.value); if (formError) setFormError(''); }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                  <span>Email Address (Unique ID)</span>
                  <span className="text-rose-500">*</span>
                </label>
                {editingStaffId && (
                  <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1 font-bold">
                    🔒 Locked (Permanent)
                  </span>
                )}
              </div>
              <input
                type="email"
                required
                disabled={Boolean(editingStaffId)}
                readOnly={Boolean(editingStaffId)}
                placeholder="e.g. liam@photocrew.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (formError) setFormError(''); }}
                className={`w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none font-mono ${
                  editingStaffId ? 'opacity-60 cursor-not-allowed bg-zinc-900/60 border-zinc-800' : ''
                }`}
              />
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                  <span>Mobile Contact Number</span>
                  <span className="text-rose-500">*</span>
                </label>
                {editingStaffId && (
                  <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1 font-bold">
                    🔒 Locked (Permanent)
                  </span>
                )}
              </div>
              <input
                type="tel"
                required
                disabled={Boolean(editingStaffId)}
                readOnly={Boolean(editingStaffId)}
                placeholder="e.g. +1 (555) 765-4321"
                value={mobile}
                onChange={(e) => { setMobile(e.target.value); if (formError) setFormError(''); }}
                className={`w-full bg-zinc-900 border rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none font-mono ${
                  editingStaffId ? 'opacity-60 cursor-not-allowed bg-zinc-900/60 border-zinc-800' : formError && formError.toLowerCase().includes('mobile') ? 'border-rose-500/70' : 'border-zinc-800'
                }`}
              />
              {formError && formError.toLowerCase().includes('mobile') && (
                <p className="text-xs text-rose-400 mt-1">
                  {formError}
                </p>
              )}
            </div>

            {/* Account Login Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                  <Key className="w-3 h-3 text-violet-400" />
                  <span>{editingStaffId ? 'New Password' : 'Account Login Password'}</span>
                  {!editingStaffId && <span className="text-rose-500">*</span>}
                </label>
              </div>
              <div className="relative">
                <input
                  type={showStaffPassword ? "text" : "password"}
                  required={!editingStaffId}
                  minLength={6}
                  placeholder={editingStaffId ? "Leave blank to keep existing password" : "Password"}
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 pr-10 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPassword(!showStaffPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1"
                >
                  {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {editingStaffId && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold block">
                  CURRENT PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={currentStaffPassword && !loadingCurrentPassword && !showCurrentPassword ? "password" : "text"}
                    readOnly
                    value={
                      loadingCurrentPassword
                        ? "Loading..."
                        : currentStaffPassword
                          ? currentStaffPassword
                          : currentPasswordError
                            ? currentPasswordError
                            : "Not available (reset password once)"
                    }
                    aria-label="Current password"
                    className={`w-full bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 pr-10 outline-none font-mono text-xs ${
                      currentStaffPassword && !loadingCurrentPassword ? 'text-white' : 'text-zinc-400 italic'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={loadingCurrentPassword || !currentStaffPassword}
                    onClick={() => setShowCurrentPassword(prev => !prev)}
                    aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* WhatsApp */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>WhatsApp Contact Number</span>
              </label>
              <input
                type="tel"
                placeholder="e.g. +1 (555) 765-4321"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none font-mono"
              />
            </div>

            {/* Joining Date */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>Joining Date</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:border-violet-500 outline-none font-mono"
              />
            </div>

            {/* Skills / Specialities Checkboxes */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>Skills / Specialities</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3 max-h-48 overflow-y-auto">
                {specialities.filter(s => s.active).map(spec => (
                  <label key={spec.speciality_id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      value={spec.name}
                      checked={skills.includes(spec.name)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSkills([...skills, spec.name]);
                        } else {
                          setSkills(skills.filter(s => s !== spec.name));
                        }
                      }}
                      className="w-3.5 h-3.5 accent-violet-500"
                    />
                    <span className="text-xs text-zinc-300 font-mono">{spec.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>Experience Level</span>
                <span className="text-rose-500">*</span>
              </label>
              <select
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 focus:border-violet-500 outline-none cursor-pointer font-mono"
              >
                <option value="1-3 Years">Junior Editor (1-3 Years)</option>
                <option value="3-5 Years">Mid-Level (3-5 Years)</option>
                <option value="5-8 Years">Senior specialist (5-8 Years)</option>
                <option value="8+ Years">Technical Expert / Lead (8+ Years)</option>
              </select>
            </div>

            {/* Department dropdown list */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>Corporate Department</span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 focus:border-violet-500 outline-none cursor-pointer font-mono"
              >
                {DEPARTMENTS.map(deptOpt => (
                  <option key={deptOpt} value={deptOpt}>{deptOpt}</option>
                ))}
              </select>
            </div>

            {/* Profile Photo URL Optional */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                  <span>Profile Photo URL (Optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowPhotoTip(!showPhotoTip)}
                  className="text-[9px] font-mono text-violet-400 underline hover:text-violet-300 cursor-pointer"
                >
                  Need temporary placeholder avatar?
                </button>
              </div>
              <input
                type="url"
                placeholder="https://images.unsplash.com/... or leave blank for initials"
                value={profilePhoto}
                onChange={(e) => setProfilePhoto(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none font-mono"
              />
              
              {showPhotoTip && (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2 mt-2 text-[11px] font-mono text-zinc-400 leading-relaxed w-full max-w-full">
                  <div className="font-bold text-white flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Instant Copy-Paste Placeholders</span>
                  </div>
                  <div>You can use these curated custom-styled production and designer avatars:</div>
                  <div className="space-y-1">
                    <div>• <strong>FTE Editor</strong>: <code>https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200</code></div>
                    <div>• <strong>Videographer</strong>: <code>https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200</code></div>
                    <div>• <strong>Lead Manager</strong>: <code>https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200</code></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePhoto('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200');
                      setShowPhotoTip(false);
                    }}
                    className="mt-1 p-1 px-3 text-[9px] font-extrabold uppercase bg-violet-500/10 text-violet-400 rounded border border-violet-500/20 hover:bg-violet-500/20 cursor-pointer"
                  >
                    Load Sample Avatar automatically
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center gap-1">
                <span>Personal Remarks & Technical Capabilities notes</span>
              </label>
              <textarea
                placeholder="Enter technical skill specifications, certifications, special camera equipment limits, or secondary competencies..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none resize-none font-sans"
              />
            </div>

            {/* Status active/inactive checkbox */}
            <div className="md:col-span-2 p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white uppercase">Primary Status</div>
                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Toggle default active status immediately upon onboarding</p>
              </div>
              <button
                type="button"
                onClick={() => setStatus(status === 'Active' ? 'Inactive' : 'Active')}
                className="cursor-pointer"
              >
                {status === 'Active' ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-mono font-bold text-xs">
                    <span>ACTIVE</span>
                    <ToggleRight className="w-7 h-7" />
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-zinc-500 font-mono font-bold text-xs">
                    <span>INACTIVE</span>
                    <ToggleLeft className="w-7 h-7" />
                  </span>
                )}
              </button>
            </div>

          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-violet-500/15 cursor-pointer flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Generate Crew Roll Verification & Register</span>
          </button>
        </form>
      )}

      {/* SPECIALITIES TAB CONTAINER */}
      {activeSubTab === 'specialities' && (
        <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-6 shadow-xl relative animate-fade-in">
          <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-violet-500/50 rounded-full" />
          <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-violet-500/50 rounded-full" />
          
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-350 border-b border-zinc-900 pb-3 font-mono">
            MANAGE PRODUCTION ROLE SPECIALITIES
          </h2>

          {/* Add / Edit Specialty Form */}
          <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              {editingSpecId ? 'Edit Room Speciality' : 'Add New Production Speciality'}
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="e.g. Wedding Video Editor, Reel Editor..."
                value={editingSpecId ? editingSpecName : newSpecName}
                onChange={(e) => editingSpecId ? setEditingSpecName(e.target.value) : setNewSpecName(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-850 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (editingSpecId) {
                      if (!editingSpecName.trim()) return;
                      await updateSpeciality(editingSpecId, editingSpecName.trim());
                      setEditingSpecId(null);
                      setEditingSpecName('');
                    } else {
                      if (!newSpecName.trim()) return;
                      await addSpeciality(newSpecName.trim());
                      setNewSpecName('');
                    }
                  }}
                  className="px-5 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  {editingSpecId ? 'Save' : 'Create Speciality'}
                </button>
                {editingSpecId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSpecId(null);
                      setEditingSpecName('');
                    }}
                    className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Specialities List Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-900 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  <th className="py-3 px-4 font-bold">Speciality ID</th>
                  <th className="py-3 px-4 font-bold">Speciality Name</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60">
                {specialities.map((spec) => (
                  <tr key={spec.speciality_id} className="hover:bg-zinc-900/10">
                    <td className="py-3.5 px-4 font-mono text-zinc-400">{spec.speciality_id}</td>
                    <td className="py-3.5 px-4 font-bold text-white text-xs">{spec.name}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-mono tracking-wider font-extrabold uppercase ${
                        spec.active 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                      }`}>
                        {spec.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2.5">
                      <button
                        onClick={() => {
                          setEditingSpecId(spec.speciality_id);
                          setEditingSpecName(spec.name);
                        }}
                        className="text-[10px] font-mono font-bold text-violet-400 hover:text-violet-350 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          await deactivateSpeciality(spec.speciality_id, !spec.active);
                        }}
                        className={`text-[10px] font-mono font-bold cursor-pointer ${
                          spec.active ? 'text-zinc-400 hover:text-white' : 'text-emerald-400 hover:text-emerald-350'
                        }`}
                      >
                        {spec.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STAFF PASSWORD RESET MODAL DIALOG */}
      {resetModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Key className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Reset Staff Password</h3>
                  <p className="text-[10px] text-zinc-400 font-mono">Staff Account: {resetModalStaff.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetModalStaff(null);
                  setNewStaffPassword('');
                  setShowNewStaffPassword(false);
                  setResetSuccessMessage('');
                  setResetErrorMessage('');
                }}
                className="text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {resetSuccessMessage ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="text-xs text-emerald-300 font-medium">{resetSuccessMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleResetStaffPasswordModal} className="space-y-4">
                {resetErrorMessage && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{resetErrorMessage}</span>
                  </div>
                )}
                <div className="bg-zinc-900/60 border border-zinc-850 p-3 rounded-xl space-y-1.5 text-xs font-mono">
                  <div className="text-zinc-400 flex justify-between">
                    <span>Email ID:</span>
                    <span className="text-white font-bold">{resetModalStaff.email}</span>
                  </div>
                  <div className="text-zinc-400 flex justify-between">
                    <span>Mobile Number:</span>
                    <span className="text-white font-bold">{resetModalStaff.mobile}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex items-center justify-between">
                    <span>New Password</span>
                    <span className="text-zinc-500 font-normal">Min 6 characters</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewStaffPassword ? "text" : "password"}
                      required
                      minLength={6}
                      placeholder="Enter new password"
                      value={newStaffPassword}
                      onChange={(e) => {
                        setNewStaffPassword(e.target.value);
                        if (resetErrorMessage) setResetErrorMessage('');
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 pr-10 text-xs text-white placeholder-zinc-500 focus:border-violet-500 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewStaffPassword(!showNewStaffPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1"
                    >
                      {showNewStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-violet-950/20 border border-violet-900/30 rounded-xl text-[11px] text-zinc-400 leading-relaxed">
                  <strong className="text-violet-300">Note:</strong> The staff member will be able to log into their dashboard using either their Email or Mobile Number with this password. It will not expire or ask for setup again.
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetModalStaff(null);
                      setNewStaffPassword('');
                      setShowNewStaffPassword(false);
                      setResetErrorMessage('');
                    }}
                    className="w-1/2 py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting || !newStaffPassword || newStaffPassword.length < 6}
                    className="w-1/2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isResetting ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Update Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
