import React, { useState, useMemo } from 'react';
import { useRole, mapToDbUserId } from './RoleContext';
import { supabaseClient } from '../supabaseClient';
import { 
  Users, UserPlus, Shield, ToggleLeft, ToggleRight, Key, Mail, Phone, Calendar, 
  PenTool, CheckCircle, Ban, RefreshCw, X, AlertOctagon, HelpCircle, Activity, 
  Server, Database, Check, AlertCircle as AlertCircleIcon, Terminal, 
  Trash2, Briefcase, Eye, EyeOff, Save, Lock, Copy, CheckCheck, Loader2
} from 'lucide-react';
import { User, UserRole, Lead } from '../types';
import { formatDateDDMMYY, checkGlobalStaffUniqueness, formatStaffErrorMessage } from '../utils';

export const SalesStaffManagementModule: React.FC = () => {
  const { users, staff = [], productionStaff = [], currentUser, addUser, editUser, deleteUser, toggleUserStatus, resetUserPassword, leads, currentRole } = useRole();

  // Filter only sales team users
  const salesStaffList = useMemo(() => {
    return users.filter(u => u.role === 'Sales Team');
  }, [users]);

  // Form & modal states
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showResetPwdForm, setShowResetPwdForm] = useState(false);
  
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [showViewPassword, setShowViewPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [isFetchingFresh, setIsFetchingFresh] = useState(false);

  // New Staff State
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newEmployeeId, setNewEmployeeId] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [addFormError, setAddFormError] = useState('');

  // Edit Staff State
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Reset Password State
  const [resetPwd, setResetPwd] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(false);

  // Helper to fetch the latest saved account data from database (bypassing stale state)
  const fetchFreshAccountData = async (userId: string, userObj?: User): Promise<any | null> => {
    const dbUserId = mapToDbUserId(userId);

    // 1. Check direct Supabase query by ID
    try {
      if (supabaseClient) {
        const { data, error } = await supabaseClient
          .from('users')
          .select('*')
          .eq('id', dbUserId)
          .maybeSingle();
        if (data && !error) return data;
      }
    } catch (e) {
      console.warn("Direct supabase fresh account read error:", e);
    }

    // 2. Direct Supabase query by Email if available
    if (userObj?.email && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('users')
          .select('*')
          .ilike('email', userObj.email.trim())
          .maybeSingle();
        if (data && !error) return data;
      } catch (e) {}
    }

    // 3. Direct Supabase query by Mobile if available
    if (userObj?.mobile && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('users')
          .select('*')
          .eq('mobile', userObj.mobile.trim())
          .maybeSingle();
        if (data && !error) return data;
      } catch (e) {}
    }

    // 4. Server proxy query by ID
    try {
      const res = await fetch('/api/db/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'users',
          matchColumn: 'id',
          matchValue: dbUserId
        })
      });
      const resData = await res.json();
      if (resData.success && resData.data?.[0]) {
        return resData.data[0];
      }
    } catch (e) {
      console.warn("Server proxy fresh account read error:", e);
    }

    // 5. Server proxy query by Email
    if (userObj?.email) {
      try {
        const res = await fetch('/api/db/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'users',
            matchColumn: 'email',
            matchValue: userObj.email.trim().toLowerCase()
          })
        });
        const resData = await res.json();
        if (resData.success && resData.data?.[0]) {
          return resData.data[0];
        }
      } catch (e) {}
    }

    // 6. Server proxy query by Mobile
    if (userObj?.mobile) {
      try {
        const res = await fetch('/api/db/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'users',
            matchColumn: 'mobile',
            matchValue: userObj.mobile.trim()
          })
        });
        const resData = await res.json();
        if (resData.success && resData.data?.[0]) {
          return resData.data[0];
        }
      } catch (e) {}
    }

    return null;
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newMobile.trim() || !newPassword.trim()) {
      alert("Name, Mobile, and Password are required.");
      return;
    }

    const uniquenessCheck = checkGlobalStaffUniqueness({
      mobile: newMobile,
      email: newEmail.trim() || undefined,
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
      setAddFormError(errMsg);
      alert(errMsg);
      return;
    }

    setAddFormError('');
    try {
      await addUser(newName, newEmail, newMobile, 'Sales Team', newActive, newPassword, newEmployeeId);
      
      alert("Staff added successfully.");
      setNewName('');
      setNewEmail('');
      setNewMobile('');
      setNewPassword('');
      setNewEmployeeId('');
      setNewActive(true);
      setShowAddForm(false);
    } catch (err: any) {
      const errMsg = formatStaffErrorMessage(err);
      setAddFormError(errMsg);
      alert(errMsg);
    }
  };

  // Open Edit Form and always fetch fresh saved account data
  const openEditForm = async (usr: User) => {
    setSelectedUserId(usr.id);
    setEditName(usr.name);
    setEditEmail(usr.email || '');
    setEditMobile(usr.mobile);
    setEditEmployeeId(usr.employee_id || '');
    setEditActive(usr.active);
    setEditPassword(usr.password || '');
    setShowEditPassword(false);
    setShowEditForm(true);
    setIsFetchingFresh(true);

    // Fetch the latest saved account data directly from the database to guarantee fresh values
    try {
      const fresh = await fetchFreshAccountData(usr.id, usr);
      if (fresh) {
        if (fresh.name) setEditName(fresh.name);
        if (fresh.email !== undefined) setEditEmail(fresh.email || '');
        if (fresh.mobile) setEditMobile(fresh.mobile);
        if (fresh.employee_id !== undefined) setEditEmployeeId(fresh.employee_id || '');
        if (fresh.active !== undefined) setEditActive(fresh.active !== false && fresh.active !== 'false');
        if (fresh.password) setEditPassword(fresh.password);
      }
    } catch (err) {
      console.warn("Error fetching fresh account details for edit:", err);
    } finally {
      setIsFetchingFresh(false);
    }
  };

  // Open View Modal and fetch fresh account data
  const openViewModal = async (usr: User) => {
    setSelectedUserId(usr.id);
    setViewUser(usr);
    setShowViewPassword(false);
    setCopiedPassword(false);
    setShowViewModal(true);
    setIsFetchingFresh(true);

    try {
      const fresh = await fetchFreshAccountData(usr.id, usr);
      if (fresh) {
        setViewUser({
          ...usr,
          ...fresh,
          password: fresh.password || usr.password || '',
          active: fresh.active !== false && fresh.active !== 'false'
        });
      }
    } catch (err) {
      console.warn("Error fetching fresh account details for view:", err);
    } finally {
      setIsFetchingFresh(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    if (!editName.trim() || !editMobile.trim()) {
      alert("Name and Mobile are required.");
      return;
    }
    if (!editPassword.trim()) {
      alert("Password cannot be empty.");
      return;
    }

    const existingUser = users.find(u => u.id === selectedUserId);
    const uniquenessCheck = checkGlobalStaffUniqueness({
      mobile: editMobile.trim(),
      email: editEmail.trim() || undefined,
      excludeId: selectedUserId,
      excludeEmail: existingUser?.email,
      excludeMobile: existingUser?.mobile,
      usersList: users,
      opStaffList: staff,
      prodStaffList: productionStaff
    });
    if (!uniquenessCheck.isUnique) {
      alert(uniquenessCheck.error || "Duplicate staff details detected.");
      return;
    }

    try {
      await editUser(selectedUserId, {
        name: editName.trim(),
        email: editEmail.trim(),
        mobile: editMobile.trim(),
        role: 'Sales Team',
        employee_id: editEmployeeId.trim(),
        active: editActive,
        password: editPassword.trim()
      });
      alert("Staff details updated successfully.");
      setShowEditForm(false);
      setSelectedUserId(null);
    } catch (err: any) {
      alert(formatStaffErrorMessage(err));
    }
  };

  // Open Reset Password modal and prefill with current saved password from database
  const openResetPasswordModal = async (usr: User) => {
    setSelectedUserId(usr.id);
    setResetPwd(usr.password || '');
    setShowResetPwd(false);
    setShowResetPwdForm(true);
    setIsFetchingFresh(true);

    try {
      const fresh = await fetchFreshAccountData(usr.id, usr);
      if (fresh && fresh.password) {
        setResetPwd(fresh.password);
      }
    } catch (err) {
      console.warn("Error fetching fresh password for reset:", err);
    } finally {
      setIsFetchingFresh(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !resetPwd.trim()) {
      alert("Password is required.");
      return;
    }
    
    try {
      await resetUserPassword(selectedUserId, resetPwd.trim());
      setResetPwd('');
      setShowResetPwdForm(false);
      setSelectedUserId(null);
      alert("Password updated and saved successfully!");
    } catch (err: any) {
      alert(`Failed to reset password: ${err.message}`);
    }
  };

  const handleCopyPassword = (pwd: string) => {
    if (!pwd) return;
    navigator.clipboard.writeText(pwd);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };
  
  const getAssignedLeadsCount = (userId: string, userName: string) => {
    return leads.filter(l => l.sales_staff_id === userId || l.sales_person === userName).length;
  };
  
  const getActiveAssignedLeadsCount = (userId: string, userName: string) => {
    return leads.filter(l => (l.sales_staff_id === userId || l.sales_person === userName) && l.status !== 'Lead Lost' && l.status !== 'Order Confirmed').length;
  };

  const handleDeleteStaff = async (usr: User) => {
    const activeLeadsCount = getActiveAssignedLeadsCount(usr.id, usr.name);
    if (activeLeadsCount > 0) {
      alert(`Cannot delete this Sales Staff because they have ${activeLeadsCount} active lead(s) assigned. Please reassign the leads before deleting.`);
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${usr.name}? This action cannot be undone.`)) {
      try {
        await deleteUser(usr.id);
      } catch (err: any) {
        alert(`Failed to delete staff: ${err.message}`);
      }
    }
  };

  if (currentRole !== 'Business Owner') {
    return (
      <div className="p-8 text-center text-rose-500">
        You do not have permission to view this page.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Sales Staff Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage Sales Executives, authentication, and assignments.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/20"
        >
          <UserPlus className="w-4 h-4" />
          Add Sales Staff
        </button>
      </div>

      <div className="bg-[#09090b] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative">
        <div className="overflow-x-auto min-h-[400px] custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-zinc-900/50 border-b border-zinc-800 text-[10px] uppercase font-mono tracking-wider text-zinc-400 whitespace-nowrap">
                <th className="p-3 font-bold text-center w-16 min-w-[64px] whitespace-nowrap">S.NO</th>
                <th className="p-4 font-bold">Staff Name</th>
                <th className="p-4 font-bold">Contact</th>
                <th className="p-4 font-bold">Employee ID</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold">Leads (Total/Active)</th>
                <th className="p-4 font-bold">Created Date</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {salesStaffList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500 font-mono text-xs">
                    No Sales Staff found. Click "Add Sales Staff" to create one.
                  </td>
                </tr>
              ) : (
                salesStaffList.map((usr, idx) => (
                  <tr key={usr.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="p-3 font-mono text-zinc-400 text-center text-xs font-bold w-16 min-w-[64px] whitespace-nowrap">
                      {idx + 1}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="font-bold text-slate-200">{usr.name}</div>
                      {usr.username && <div className="text-xs text-slate-500">@{usr.username}</div>}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {usr.mobile}
                      </div>
                      {usr.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                          <Mail className="w-3 h-3" />
                          {usr.email}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm font-mono text-slate-300 whitespace-nowrap">
                      {usr.employee_id || '-'}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${usr.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                        {usr.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-mono whitespace-nowrap">
                      <span className="text-slate-300">{getAssignedLeadsCount(usr.id, usr.name)} Total</span>
                      <span className="text-slate-500 mx-2">|</span>
                      <span className="text-indigo-400">{getActiveAssignedLeadsCount(usr.id, usr.name)} Active</span>
                    </td>
                    <td className="p-4 text-xs text-slate-400 font-mono whitespace-nowrap">
                      {formatDateDDMMYY(usr.created_at)}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openViewModal(usr)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="View Staff Details & Password"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditForm(usr)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Edit Staff"
                        >
                          <PenTool className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleUserStatus(usr.id)}
                          className={`p-1.5 rounded transition-colors cursor-pointer ${usr.active ? 'text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20' : 'text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'}`}
                          title={usr.active ? 'Deactivate Account' : 'Activate Account'}
                        >
                          {usr.active ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => openResetPasswordModal(usr)}
                          className="p-1.5 text-slate-400 hover:text-sky-400 bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Reset Password"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(usr)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-900 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Delete Staff"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Add Sales Staff
              </h2>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {addFormError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs flex items-center gap-2">
                  <span>{addFormError}</span>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name *</label>
                  <input type="text" required value={newName} onChange={e => { setNewName(e.target.value); if (addFormError) setAddFormError(''); }} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. John Doe" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Mobile Number (Login ID) *</label>
                  <input 
                    type="tel" 
                    required 
                    value={newMobile} 
                    onChange={e => { setNewMobile(e.target.value); if (addFormError) setAddFormError(''); }} 
                    className={`w-full bg-zinc-900 border rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors ${addFormError && addFormError.toLowerCase().includes('mobile') ? 'border-rose-500/70' : 'border-zinc-800'}`} 
                    placeholder="10-digit mobile number" 
                  />
                  {addFormError && addFormError.toLowerCase().includes('mobile') && (
                    <p className="text-xs text-rose-400 mt-1">
                      {addFormError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Password *</label>
                  <div className="relative">
                    <input 
                      type={showNewPassword ? "text" : "password"} 
                      required 
                      value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)} 
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-4 pr-10 py-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" 
                      placeholder="Create a secure password" 
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer p-1"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Email Address (Optional)</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Employee ID (Optional)</label>
                  <input type="text" value={newEmployeeId} onChange={e => setNewEmployeeId(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="EMP-1001" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <label className="text-sm font-bold text-slate-300">Status</label>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-bold ${newActive ? 'text-emerald-400' : 'text-slate-500'}`}>ACTIVE</span>
                    <button type="button" onClick={() => setNewActive(!newActive)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${newActive ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="pt-6 flex gap-3 justify-end border-t border-zinc-800 mt-6">
                <button type="button" onClick={() => setShowAddForm(false)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-zinc-800 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-2 cursor-pointer">
                  <Save className="w-4 h-4" />
                  Save Sales Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <PenTool className="w-5 h-5 text-indigo-400" />
                Edit Sales Staff
              </h2>
              <button onClick={() => setShowEditForm(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name *</label>
                  <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Mobile Number (Login ID) *</label>
                    <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1 font-bold">🔒 Locked (Permanent)</span>
                  </div>
                  <input type="tel" disabled readOnly value={editMobile} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none opacity-60 cursor-not-allowed bg-zinc-900/60 font-mono" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address (Optional)</label>
                    <span className="text-[10px] text-amber-500 font-mono flex items-center gap-1 font-bold">🔒 Locked (Permanent)</span>
                  </div>
                  <input type="email" disabled readOnly value={editEmail} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none opacity-60 cursor-not-allowed bg-zinc-900/60 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Employee ID (Optional)</label>
                  <input type="text" value={editEmployeeId} onChange={e => setEditEmployeeId(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors font-mono" />
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Account Password *</label>
                    <span className="text-[10px] text-indigo-400 font-mono flex items-center gap-1 font-semibold">
                      {isFetchingFresh ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Saved Password'}
                    </span>
                  </div>
                  <div className="relative">
                    <input 
                      type={showEditPassword ? "text" : "password"} 
                      required 
                      value={editPassword} 
                      onChange={e => setEditPassword(e.target.value)} 
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-4 pr-10 py-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors" 
                      placeholder="Enter password" 
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer p-1"
                      title={showEditPassword ? "Hide password" : "Show password"}
                    >
                      {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Displays the saved password from the database. Edit this field to update the password.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="text-sm font-bold text-slate-300">Status</label>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-bold ${editActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {editActive ? 'ACTIVE' : 'DEACTIVATED'}
                    </span>
                    <button type="button" onClick={() => setEditActive(!editActive)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${editActive ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editActive ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="pt-6 flex gap-3 justify-end border-t border-zinc-800 mt-6">
                <button type="button" onClick={() => setShowEditForm(false)} className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-zinc-800 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-2 cursor-pointer">
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Staff Details Modal */}
      {showViewModal && viewUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-base">
                  {viewUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    {viewUser.name}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${viewUser.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {viewUser.active ? 'Active' : 'Deactivated'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">Sales Staff Account Details</p>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Mobile Number (Login ID)</label>
                  <div className="flex items-center gap-1.5 text-sm font-mono text-slate-200 font-semibold">
                    <Phone className="w-3.5 h-3.5 text-indigo-400" />
                    {viewUser.mobile}
                  </div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Employee ID</label>
                  <div className="text-sm font-mono text-slate-200 font-semibold">
                    {viewUser.employee_id || '-'}
                  </div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Email Address</label>
                  <div className="flex items-center gap-1.5 text-sm font-mono text-slate-200">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    {viewUser.email || 'None'}
                  </div>
                </div>

                {/* Password Box */}
                <div className="bg-zinc-900/90 border border-indigo-500/30 rounded-xl p-3.5 sm:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-indigo-400" />
                      Current Account Password
                    </label>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {isFetchingFresh ? <Loader2 className="w-3 h-3 animate-spin" /> : 'From Database'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-black/50 border border-zinc-800 rounded-lg px-3 py-2">
                    <span className="font-mono text-sm tracking-wider text-slate-100 font-semibold select-all">
                      {showViewPassword ? (viewUser.password || '(Not set)') : '••••••••••••'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowViewPassword(!showViewPassword)}
                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title={showViewPassword ? "Hide password" : "Show password"}
                      >
                        {showViewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyPassword(viewUser.password || '')}
                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        title="Copy password"
                      >
                        {copiedPassword ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Assigned Leads</label>
                  <div className="text-base font-bold text-slate-200">
                    {getAssignedLeadsCount(viewUser.id, viewUser.name)} Leads
                  </div>
                </div>

                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Active Leads</label>
                  <div className="text-base font-bold text-indigo-400">
                    {getActiveAssignedLeadsCount(viewUser.id, viewUser.name)} Active
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-2 justify-end border-t border-zinc-800 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowViewModal(false);
                    openEditForm(viewUser);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Edit Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowViewModal(false);
                    openResetPasswordModal(viewUser);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPwdForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-400" />
                Reset Password
              </h2>
              <button onClick={() => setShowResetPwdForm(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Current / New Password *</label>
                  <span className="text-[10px] text-sky-400 font-mono">
                    {isFetchingFresh ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Saved Password'}
                  </span>
                </div>
                <div className="relative">
                  <input 
                    type={showResetPwd ? "text" : "password"} 
                    required 
                    value={resetPwd} 
                    onChange={e => setResetPwd(e.target.value)} 
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-4 pr-10 py-2.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500 transition-colors" 
                    placeholder="Enter new password" 
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPwd(!showResetPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer p-1"
                    title={showResetPwd ? "Hide password" : "Show password"}
                  >
                    {showResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Displays current saved password from the database. Enter a new password if you want to change it.
                </p>
              </div>
              <div className="pt-2 flex gap-2 justify-end">
                <button type="button" onClick={() => setShowResetPwdForm(false)} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-zinc-800 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer">
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
